#!/bin/bash
# APOLO v5, encadenado en el CT107 (sin depender del PC): espera el dataset → valida → entrena (cola gestionada) → fusiona → GGUF Q4_K_M.
# El último paso (copiar al CT100 y `ollama create apolo`) se hace desde el host. Estado en apolo/nacer.json.
set -u
R=/srv/entrenamiento; A=$R/apolo; L=/home/trainer/.soup/llama.cpp
export HF_HOME=$R/cache/huggingface
estado() { printf '{"paso":"%s","hora":%s,"detalle":"%s","version":5}\n' "$1" "$(date +%s)" "${2:-}" > $A/nacer.json; }

estado esperando-dataset "v5"
while true; do
  activo=$(python3 -c "import json;print(json.load(open('$A/estado.json')).get('activo'))" 2>/dev/null || echo True)
  pid=$(python3 -c "import json;print(json.load(open('$A/estado.json')).get('pid',''))" 2>/dev/null); vivo=0; [ -n "$pid" ] && [ -d /proc/$pid ] && vivo=1
  if [ "$activo" != "True" ] || [ $vivo -eq 0 ]; then [ -s $A/apolo-train.jsonl ] && break; fi
  sleep 60
done
# quitar ejemplos que no caben (si no, Soup rechaza el entrenamiento)
/opt/Soup/.venv/bin/python - <<'EOF'
import json
from transformers import AutoTokenizer
t = AutoTokenizer.from_pretrained('/srv/entrenamiento/models/qwen3-4b')
for n in ('apolo-train.jsonl', 'apolo-val.jsonl'):
    p = '/srv/entrenamiento/apolo/' + n
    L = [l for l in open(p, encoding='utf-8') if l.strip()]
    ok = [l for l in L if len(t(t.apply_chat_template(json.loads(l)['messages'], tokenize=False))['input_ids']) <= 1000]
    open(p, 'w', encoding='utf-8').write(''.join(ok)); print(n, len(ok), 'de', len(L))
EOF
n=$(wc -l < $A/apolo-train.jsonl)
estado validando "v5 · $n ejemplos"
cd $R
if ! /opt/Soup/.venv/bin/python cola.py --config $A/apolo-v5.yaml --dry-run > $A/dry-run.log 2>&1; then estado error "apolo-v5.yaml no pasó la validación"; exit 1; fi
mkdir -p $R/apolo-logs
estado entrenando "v5 · $n ejemplos"
TS=$(date +%Y-%m-%dT%H-%M-%S)
/opt/Soup/.venv/bin/python cola.py --config $A/apolo-v5.yaml --yes > $R/apolo-logs/$TS.log 2>&1 < /dev/null || { estado fallo "v5: entrenamiento (apolo-logs/$TS.log)"; exit 1; }
estado fusionando "v5"
rm -rf $R/output/apolo-v5-fusionado
/opt/Soup/.venv/bin/python $A/fusionar-lora.py --base $R/models/qwen3-4b --lora $R/output/apolo-v5 --salida $R/output/apolo-v5-fusionado > $A/fusionar.log 2>&1 || { estado fallo "v5: fusión"; exit 1; }
estado exportando "v5 → GGUF Q4_K_M"
/opt/Soup/.venv/bin/soup export --model output/apolo-v5-fusionado --format gguf --quant q4_k_m --output output/apolo-v5.q4_k_m.gguf --llama-cpp $L > $A/export.log 2>&1 || { estado fallo "v5: exportar"; exit 1; }
rm -rf $R/output/apolo-v5-fusionado
estado terminado "v5 lista: output/apolo-v5.q4_k_m.gguf (falta cargarla en Ollama)"
