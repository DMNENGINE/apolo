"""Reranker de la memoria: Qwen3-Reranker-0.6B (Apache-2.0) cargado una vez en la GPU, sin internet.
La búsqueda híbrida (embeddings + palabras) trae ~24 candidatos; esto los reordena leyendo consulta y recuerdo JUNTOS,
así los 8 que entran al contexto son los que de verdad responden al mensaje.
Protocolo por stdin/stdout (una línea JSON):
  arranque -> {"ready": true, "device": "cuda"}
  {"id": 1, "q": "consulta", "docs": ["recuerdo 1", ...]} -> {"id": 1, "scores": [0.93, 0.02, ...], "ms": 60}
Solo GPU (fp16, ~1,3 GB): en CPU tardaría segundos por mensaje; sin GPU la app sigue con la búsqueda híbrida.
"""
import json, os, sys, time, importlib.util

try:                                                          # mismas DLL CUDA que whisper_srv (torch/lib)
    _t = importlib.util.find_spec('torch')
    if _t and _t.origin and os.name == 'nt':
        _lib = os.path.join(os.path.dirname(_t.origin), 'lib')
        if os.path.isdir(_lib): os.add_dll_directory(_lib)
except Exception:
    pass

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODELO = os.environ.get('ROBOT_RERANK_MODELO') or 'Qwen/Qwen3-Reranker-0.6B'
TAREA = 'Dado el mensaje del usuario a su asistente, decide si este recuerdo sobre el usuario es útil para responderlo'
PREFIJO = ('<|im_start|>system\nJudge whether the Document meets the requirements based on the Query and the Instruct provided. '
           'Note that the answer can only be "yes" or "no".<|im_end|>\n<|im_start|>user\n')
SUFIJO = '<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n'
MAX = 512                                                     # los recuerdos son cortos (≤ 600 caracteres)

def out(o):
    sys.stdout.write(json.dumps(o, ensure_ascii=False) + '\n'); sys.stdout.flush()

def main():
    if not torch.cuda.is_available(): raise SystemExit('sin CUDA')
    tok = AutoTokenizer.from_pretrained(MODELO, padding_side='left')
    model = AutoModelForCausalLM.from_pretrained(MODELO, dtype=torch.float16).cuda().eval()
    si, no = tok.convert_tokens_to_ids('yes'), tok.convert_tokens_to_ids('no')
    pre, suf = tok.encode(PREFIJO, add_special_tokens=False), tok.encode(SUFIJO, add_special_tokens=False)

    @torch.no_grad()
    def puntuar(q, docs):
        textos = [f'<Instruct>: {TAREA}\n<Query>: {q}\n<Document>: {d}' for d in docs]
        enc = tok(textos, padding=False, truncation='longest_first', return_attention_mask=False, max_length=MAX - len(pre) - len(suf))
        enc['input_ids'] = [pre + ids + suf for ids in enc['input_ids']]
        enc = tok.pad(enc, padding=True, return_tensors='pt').to('cuda')
        lg = model(**enc).logits[:, -1, :]
        par = torch.stack([lg[:, no], lg[:, si]], dim=1).float()
        return torch.nn.functional.log_softmax(par, dim=1)[:, 1].exp().tolist()

    puntuar('hola', ['prueba'])                               # calentar
    out({'ready': True, 'device': 'cuda'})
    for line in sys.stdin:
        line = line.strip()
        if not line: continue
        try: p = json.loads(line)
        except Exception: continue
        t0 = time.time()
        try:
            docs = [str(d)[:1500] for d in (p.get('docs') or [])][:64]
            s = puntuar(str(p.get('q', ''))[:1000], docs) if docs else []
            out({'id': p.get('id'), 'scores': [round(x, 4) for x in s], 'ms': int((time.time() - t0) * 1000)})
        except Exception as e:
            out({'id': p.get('id'), 'error': str(e)[:300]})

if __name__ == '__main__':
    main()
