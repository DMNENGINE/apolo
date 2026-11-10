#!/usr/bin/env python3
"""Fusiona el adaptador LoRA de APOLO con su base (Qwen3-4B) tensor a tensor, sin cargar el modelo entero en RAM.
W' = W + (alpha / r) * B @ A  (rsLoRA: alpha / sqrt(r)). Salida: safetensors en trozos de ~1 GB + model.safetensors.index.json,
más config/tokenizer de la base, lista para `ollama create` (Ollama la importa y la cuantiza).
Uso: python fusionar-lora.py --base <dir base> --lora <dir adaptador> --salida <dir>
"""
import argparse, json, math, os, shutil, gc
import torch
from safetensors import safe_open
from safetensors.torch import save_file

p = argparse.ArgumentParser()
p.add_argument('--base', required=True); p.add_argument('--lora', required=True); p.add_argument('--salida', required=True)
p.add_argument('--trozo-mb', type=int, default=1000)
a = p.parse_args()
os.makedirs(a.salida, exist_ok=True)

cfg = json.load(open(os.path.join(a.lora, 'adapter_config.json')))
r, alpha = cfg['r'], cfg['lora_alpha']
escala = alpha / math.sqrt(r) if cfg.get('use_rslora') else alpha / r
print(f'r={r} alpha={alpha} escala={escala} modulos={cfg.get("target_modules")}', flush=True)

# adaptador: "base_model.model.<clave base sin .weight>.lora_A.weight"
lora = {}
with safe_open(os.path.join(a.lora, 'adapter_model.safetensors'), 'pt') as f:
    for k in f.keys():
        if '.lora_A.' in k or '.lora_B.' in k:
            base_k = k.replace('base_model.model.', '', 1).replace('.lora_A.weight', '.weight').replace('.lora_B.weight', '.weight')
            lora.setdefault(base_k, {})['A' if '.lora_A.' in k else 'B'] = f.get_tensor(k)
print(f'{len(lora)} pesos con LoRA', flush=True)

# shards de la base
idx = os.path.join(a.base, 'model.safetensors.index.json')
if os.path.exists(idx):
    mapa = json.load(open(idx))['weight_map']; archivos = sorted(set(mapa.values()))
else:
    archivos = ['model.safetensors']

nuevo_mapa, trozo, tam, n_trozo, fusionados = {}, {}, 0, 0, 0
def volcar():
    global trozo, tam, n_trozo
    if not trozo: return
    n_trozo += 1; nombre = f'model-{n_trozo:05d}.safetensors'
    save_file(trozo, os.path.join(a.salida, nombre), metadata={'format': 'pt'})
    for k in trozo: nuevo_mapa[k] = nombre
    print(f'  {nombre}: {len(trozo)} tensores, {tam / 1e9:.2f} GB', flush=True)
    trozo, tam = {}, 0; gc.collect()

for arch in archivos:
    with safe_open(os.path.join(a.base, arch), 'pt') as f:
        for k in f.keys():
            t = f.get_tensor(k)
            if k in lora and 'A' in lora[k] and 'B' in lora[k]:
                d = (lora[k]['B'].float() @ lora[k]['A'].float()) * escala
                t = (t.float() + d).to(t.dtype); fusionados += 1; del d
            trozo[k] = t.contiguous(); tam += t.numel() * t.element_size()
            if tam >= a.trozo_mb * 1e6: volcar()
volcar()
total = sum(os.path.getsize(os.path.join(a.salida, v)) for v in set(nuevo_mapa.values()))
json.dump({'metadata': {'total_size': total}, 'weight_map': nuevo_mapa}, open(os.path.join(a.salida, 'model.safetensors.index.json'), 'w'), indent=1)
for n in os.listdir(a.base):
    if n.endswith('.json') and n != 'model.safetensors.index.json' or n.endswith(('.txt', '.jinja', '.model')) or n in ('LICENSE', 'tokenizer.json'):
        shutil.copy(os.path.join(a.base, n), os.path.join(a.salida, n))
print(f'listo: {fusionados} pesos fusionados de {len(lora)}; {total / 1e9:.2f} GB en {a.salida}', flush=True)
if fusionados != len(lora):
    raise SystemExit('ERROR: no se fusionaron todos los pesos con LoRA (revisa los nombres)')
