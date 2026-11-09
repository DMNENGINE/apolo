#!/bin/bash
# "Nacimiento" del modelo de APOLO en el CT107, encadenado y sin depender del PC:
#  1) descarga la base Qwen3-4B-Instruct-2507 (Apache 2.0) si falta
#  2) espera a que termine el generador del dataset (apolo/estado.json: activo=false y apolo-train.jsonl listo)
#  3) valida apolo.yaml (dry-run) y entrena por la COLA GESTIONADA (cola.py): cede la GPU a Ollama/Blender y reanuda sola
# Estado en /srv/entrenamiento/apolo/nacer.json; salida del entrenamiento en /srv/entrenamiento/apolo-logs/ (la lee el panel).
set -u
R=/srv/entrenamiento; A=$R/apolo; M=$R/models/qwen3-4b
export HF_HOME=$R/cache/huggingface
estado() { printf '{"paso":"%s","hora":%s,"detalle":"%s"}\n' "$1" "$(date +%s)" "${2:-}" > $A/nacer.json; }

if [ ! -f $M/config.json ] || ! ls $M/*.safetensors >/dev/null 2>&1; then
  estado descargando "Qwen/Qwen3-4B-Instruct-2507"
  /opt/Soup/.venv/bin/python - <<'EOF' || { estado error "no se pudo descargar la base"; exit 1; }
from huggingface_hub import snapshot_download
p = snapshot_download(repo_id='Qwen/Qwen3-4B-Instruct-2507', local_dir='/srv/entrenamiento/models/qwen3-4b',
                      allow_patterns=['*.json', '*.safetensors', '*.txt', '*.model', '*.jinja', 'LICENSE', 'README.md'], max_workers=4)
print('base descargada', p)
EOF
fi

estado esperando-dataset
while true; do
  activo=$(python3 -c "import json;print(json.load(open('$A/estado.json')).get('activo'))" 2>/dev/null || echo True)
  vivo=0; pid=$(python3 -c "import json;print(json.load(open('$A/estado.json')).get('pid',''))" 2>/dev/null); [ -n "$pid" ] && [ -d /proc/$pid ] && vivo=1
  if [ "$activo" != "True" ] || [ $vivo -eq 0 ]; then [ -s $A/apolo-train.jsonl ] && break; fi
  sleep 60
done

n=$(wc -l < $A/apolo-train.jsonl)
estado validando "$n ejemplos"
cd $R
if ! /opt/Soup/.venv/bin/python cola.py --config $A/apolo.yaml --dry-run > $A/dry-run.log 2>&1; then
  estado error "apolo.yaml no pasó la validación (mira apolo/dry-run.log)"; exit 1
fi
mkdir -p $R/apolo-logs
estado entrenando "$n ejemplos"
TS=$(date +%Y-%m-%dT%H-%M-%S)
/opt/Soup/.venv/bin/python cola.py --config $A/apolo.yaml --yes > $R/apolo-logs/$TS.log 2>&1 < /dev/null
codigo=$?
[ $codigo -eq 0 ] && estado terminado "modelo en $R/output/apolo" || estado fallo "código $codigo (mira apolo-logs/$TS.log)"
