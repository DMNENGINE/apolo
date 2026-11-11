#!/bin/bash
# APOLO manos, encadenado en el CT107 (sin depender del PC): espera el dataset → valida → entrena (cola gestionada) → fusiona → GGUF Q4_K_M.
# El último paso (copiar al CT100 y `ollama create apolo`) se hace desde el host. Estado en apolo/nacer.json.
set -u
R=/srv/entrenamiento; A=$R/apolo/manos; L=/home/trainer/.soup/llama.cpp
export HF_HOME=$R/cache/huggingface
estado() { printf '{"paso":"%s","hora":%s,"detalle":"%s","version":"manos"}\n' "$1" "$(date +%s)" "${2:-}" > $A/nacer.json; }

estado esperando-dataset "manos"
while true; do
  activo=$(python3 -c "import json;print(json.load(open('$A/estado.json')).get('activo'))" 2>/dev/null || echo True)
  pid=$(python3 -c "import json;print(json.load(open('$A/estado.json')).get('pid',''))" 2>/dev/null); vivo=0; [ -n "$pid" ] && [ -d /proc/$pid ] && vivo=1
  if [ "$activo" != "True" ] || [ $vivo -eq 0 ]; then [ -s $A/manos-train.jsonl ] && break; fi
  sleep 60
done
# quitar ejemplos que no caben (si no, Soup rechaza el entrenamiento)
/opt/Soup/.venv/bin/python - <<'EOF'
import json
from transformers import AutoTokenizer
t = AutoTokenizer.from_pretrained('/srv/entrenamiento/models/qwen3-4b')
for n in ('manos-train.jsonl', 'manos-val.jsonl'):
    p = '/srv/entrenamiento/apolo/manos/' + n
    L = [l for l in open(p, encoding='utf-8') if l.strip()]
    ok = [l for l in L if len(t(t.apply_chat_template(json.loads(l)['messages'], tools=json.loads(l).get('tools'), tokenize=False))['input_ids']) <= 2000]
    open(p, 'w', encoding='utf-8').write(''.join(ok)); print(n, len(ok), 'de', len(L))
EOF
n=$(wc -l < $A/manos-train.jsonl)
estado validando "manos · $n ejemplos"
cd $R
if ! /opt/Soup/.venv/bin/python cola.py --config $A/manos.yaml --dry-run > $A/dry-run.log 2>&1; then estado error "manos.yaml no pasó la validación"; exit 1; fi
mkdir -p $R/apolo-logs
estado entrenando "manos · $n ejemplos"
TS=$(date +%Y-%m-%dT%H-%M-%S)
/opt/Soup/.venv/bin/python cola.py --config $A/manos.yaml --yes > $R/apolo-logs/$TS.log 2>&1 < /dev/null || { estado fallo "manos: entrenamiento (apolo-logs/$TS.log)"; exit 1; }
estado fusionando "manos"
rm -rf $R/output/apolo-manos-fusionado
/opt/Soup/.venv/bin/python $A/fusionar-lora.py --base $R/models/qwen3-4b --lora $R/output/apolo-manos --salida $R/output/apolo-manos-fusionado > $A/fusionar.log 2>&1 || { estado fallo "manos: fusión"; exit 1; }
estado exportando "manos → GGUF Q4_K_M"
/opt/Soup/.venv/bin/soup export --model output/apolo-manos-fusionado --format gguf --quant q4_k_m --output output/apolo-manos.q4_k_m.gguf --llama-cpp $L > $A/export.log 2>&1 || { estado fallo "manos: exportar"; exit 1; }
rm -rf $R/output/apolo-manos-fusionado
estado terminado "manos lista: output/apolo-manos.q4_k_m.gguf (falta cargarla en Ollama)"
