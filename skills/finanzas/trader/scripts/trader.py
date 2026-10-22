"""Cliente de DMN Trader para APOLO (solo biblioteca estándar). Habla con el servidor por HTTP.
uso: python scripts/trader.py <orden> [argumentos] [clave=valor ...]
  estado | cuentas | usar <id> | precio <SIM[,SIM]> | analisis <SIM> [intervalo] | buscar <texto>
  comprar|vender <SIM> <cantidad|$importe> [tipo=limite|stop|stop_limite|trailing] [limite=] [stop=] [trail=%] [sl=] [tp=] [setup=] [nota=]
  cerrar <SIM|*> [porcentaje] | stop <SIM> <precio|be> [objetivo=] [trail=%] | ordenes | cancelar <id>
  tamano <SIM> <stop> [entrada=] [riesgo=%] | diario [n] | anotar <id> campo=valor ... | stats | examen | equity
  backtest <SIM> <estrategia> [intervalo=] [rango=] [stop_atr=] [objetivo_atr=] [tamano=todo|fraccion|riesgo] [cortos=1] [param=valor...]
  optimizar <SIM> <estrategia> param=v1,v2,v3 ... | estrategias | escaner [SIM,SIM] | vigilar <SIM[,SIM]> | olvidar <SIM>
  alerta <SIM> <mayor|menor|cambio> <valor> [nota=] | alertas | avisos | practica <SIM> [intervalo] [rango] | avanzar [n]
  reglas [riesgo_max_pct=1 perdida_diaria_max_pct=3 exigir_stop=1 ...] | nueva <nombre> [capital] | reiniciar
Config: DMN_TRADER_URL / DMN_TRADER_TOKEN, o _datos/trader.json de la skill: {"url": "http://127.0.0.1:8777", "token": ""}"""
import json, os, sys, time, urllib.request, urllib.error, urllib.parse

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def conf():
    c = {}
    try:
        with open(os.path.join(RAIZ, '_datos', 'trader.json'), encoding='utf-8') as f:
            c = json.load(f)
    except Exception:
        pass
    return (os.environ.get('DMN_TRADER_URL') or c.get('url') or 'http://127.0.0.1:8777').rstrip('/'), os.environ.get('DMN_TRADER_TOKEN') or c.get('token') or ''


def api(ruta, metodo='GET', cuerpo=None):
    url, tok = conf()
    req = urllib.request.Request(url + '/api' + ruta, method=metodo, data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
                                 headers={'content-type': 'application/json', **({'x-token': tok} if tok else {})})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            m = json.loads(e.read().decode('utf-8')).get('error')
        except Exception:
            m = str(e)
        sys.exit(f'ERROR: {m}')
    except urllib.error.URLError:
        sys.exit(f'ERROR: DMN Trader no responde en {url}. Hay que arrancarlo (iniciar.bat en la carpeta dmn-trader).')


def n(x, d=2):
    if x is None:
        return '—'
    d = d if abs(x) >= 1 else 5
    return f'{x:,.{d}f}'


def s(x, d=2):
    return '—' if x is None else f'{x:+,.{d}f}'


def kv(args):
    pos, op = [], {}
    for a in args:
        if '=' in a and not a.startswith('$'):
            k, v = a.split('=', 1)
            op[k] = v
        else:
            pos.append(a)
    return pos, op


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return v


def cid():
    a = api('/ajustes')
    if a.get('cuenta_defecto'):
        return a['cuenta_defecto']
    return api('/cuentas')[0]['id']


def f(t):
    return time.strftime('%d/%m/%y %H:%M', time.localtime(t)) if t else '—'


def mostrar_estado(c):
    print(f"Cuenta #{c['id']} «{c['nombre']}» ({c['tipo']}) · equity {n(c['equity'])} {c['moneda']} · P&L hoy {s(c['pnl_dia'])} ({s(c['pnl_dia_pct'])}%) · "
          f"total {s(c['pnl_total'])} ({s(c['pnl_total_pct'])}%) · efectivo {n(c['efectivo'])} · poder de compra {n(c['poder_compra'])}" + (' · BLOQUEADA HOY por pérdida diaria' if c['bloqueada'] else ''))
    if c.get('replay'):
        r = c['replay']
        print(f"Práctica {r['simbolo']} {r['intervalo']}: vela {r['idx'] + 1}/{r['total']} ({f(r['t'])})")
    for p in c.get('posiciones', []):
        print(f"  {p['lado'].upper()} {p['simbolo']} {n(abs(p['cantidad']), 4)} @ {n(p['precio_medio'])} → {n(p['precio'])} · P&L {s(p['pnl'])} ({s(p['pnl_pct'])}%) · SL {n(p['stop'])} · TP {n(p['objetivo'])}")
    for o in c.get('ordenes', []):
        print(f"  orden #{o['id']} {o['estado']}: {'compra' if o['lado'] == 'buy' else 'venta'} {o['simbolo']} {n(o['cantidad'], 4)} {o['tipo']}"
              + (f" lím {n(o['limite'])}" if o['limite'] else '') + (f" stop {n(o['stop'])}" if o['stop'] else '') + (' (salida)' if o['reduce'] else ''))
    if not c.get('posiciones') and not c.get('ordenes'):
        print('  Sin posiciones ni órdenes.')


def main(a):
    if not a:
        print(__doc__)
        return
    orden, (pos, op) = a[0].lower(), kv(a[1:])
    if orden == 'estado':
        mostrar_estado(api(f'/cuentas/{cid()}'))
    elif orden == 'cuentas':
        d = cid()
        for c in api('/cuentas'):
            print(f"{'→' if c['id'] == d else ' '} #{c['id']} {c['nombre']} ({c['tipo']}) equity {n(c['equity'])} {c['moneda']} · {s(c['pnl_total_pct'])}%")
    elif orden == 'usar':
        api('/ajustes', 'POST', {'cuenta_defecto': int(pos[0])})
        mostrar_estado(api(f'/cuentas/{int(pos[0])}'))
    elif orden == 'nueva':
        c = api('/cuentas', 'POST', {'nombre': pos[0], 'capital': num(pos[1]) if len(pos) > 1 else 10000, 'moneda': op.get('moneda', 'USD')})
        api('/ajustes', 'POST', {'cuenta_defecto': c['id']})
        print(f"Cuenta #{c['id']} creada con {n(c['capital_inicial'])} {c['moneda']} y puesta como activa.")
    elif orden == 'reiniciar':
        mostrar_estado(api(f'/cuentas/{cid()}/reiniciar', 'POST'))
    elif orden == 'precio':
        r = api('/cotizacion?s=' + urllib.parse.quote(pos[0]))
        for q in (r if isinstance(r, list) else [r]):
            print(f"{q['simbolo']} ({q['nombre']}): {n(q['precio'])} {q['moneda']} · {s(q['cambio_pct'])}% hoy · rango día {n(q['min_dia'])}–{n(q['max_dia'])} · "
                  f"52 sem {n(q['min_52s'])}–{n(q['max_52s'])} · mercado {'ABIERTO' if q['abierto'] else 'cerrado'} · {f(q['ts'])}")
    elif orden == 'analisis':
        x = api(f"/analisis?s={urllib.parse.quote(pos[0])}&i={pos[1] if len(pos) > 1 else '1d'}")
        r = x['rendimiento']
        print(f"{x['simbolo']} ({x['nombre']}) {n(x['precio'])} {x['moneda']} · sesgo técnico: {x['sesgo_tecnico']}")
        print(f"Rendimiento: 1s {s(r['1s'])}% · 1m {s(r['1m'])}% · 3m {s(r['3m'])}% · 6m {s(r['6m'])}% · 1a {s(r['1a'])}%")
        print(f"SMA20 {n(x['medias']['sma20'])} · SMA50 {n(x['medias']['sma50'])} · SMA200 {n(x['medias']['sma200'])} · RSI {x['rsi14']} · MACD hist {x['macd']['hist']} · ATR {n(x['atr14'])} ({x['atr_pct']}%)")
        print(f"Soportes {x['soportes']} · resistencias {x['resistencias']} · posición en rango 52 sem {x['rango_52s']['posicion_pct']}%")
        print(f"Stop técnico a 2 ATR: largo {x['stop_sugerido_atr']['largo']} / corto {x['stop_sugerido_atr']['corto']}")
        print('Señales: ' + ('; '.join(x['senales']) or 'nada destacable'))
        print(x['aviso'])
    elif orden == 'buscar':
        r = api('/buscar?q=' + urllib.parse.quote(' '.join(pos)))
        for x in r['resultados'][:8]:
            print(f"{x['simbolo']}: {x['nombre']} ({x['tipo']}, {x['bolsa']})")
        for x in r['noticias'][:4]:
            print(f"📰 {x['titulo']} — {x['fuente']} ({f(x['ts'])})")
    elif orden in ('comprar', 'vender', 'compra', 'venta'):
        cant = pos[1] if len(pos) > 1 else op.get('cantidad')
        cuerpo = {'simbolo': pos[0], 'lado': 'buy' if orden.startswith('compr') else 'sell', 'tipo': op.get('tipo') or ('trailing' if 'trail' in op else 'stop_limite' if 'stop' in op and 'limite' in op
                                                    else 'stop' if 'stop' in op else 'limite' if 'limite' in op else 'mercado'),
                  'limite': op.get('limite'), 'stop': op.get('stop'), 'trail_pct': op.get('trail'), 'sl': op.get('sl'), 'tp': op.get('tp'),
                  'setup': op.get('setup'), 'nota': op.get('nota'), 'origen': 'apolo'}
        if cant and str(cant).startswith('$'):
            cuerpo['importe'] = cant[1:]
        else:
            cuerpo['cantidad'] = cant
        o = api(f'/cuentas/{cid()}/ordenes', 'POST', cuerpo)
        print(f"Orden #{o['id']} {o['estado'].upper()}: {'compra' if o['lado'] == 'buy' else 'venta'} {o['simbolo']} {n(o['cantidad'], 4)} ({o['tipo']})"
              + (f" a {n(o['precio_ejec'])}" if o['precio_ejec'] else '') + (f" · SL {o['sl']}" if o['sl'] else '') + (f" · TP {o['tp']}" if o['tp'] else ''))
        for w in o.get('avisos', []):
            print('⚠ ' + w)
    elif orden == 'cerrar':
        r = api(f'/cuentas/{cid()}/cerrar', 'POST', {'simbolo': pos[0].upper(), 'porcentaje': num(pos[1]) if len(pos) > 1 else 100, 'nota': op.get('nota')})
        for o in (r if isinstance(r, list) else [r]):
            print(f"Cierre {o['simbolo']} orden #{o['id']} {o['estado']}" + (f" a {n(o['precio_ejec'])}" if o['precio_ejec'] else ' (se ejecutará al abrir el mercado)'))
        mostrar_estado(api(f'/cuentas/{cid()}'))
    elif orden == 'stop':
        c = cid()
        cuerpo = {'simbolo': pos[0]}
        if pos[1:] and pos[1].lower() == 'be':
            p = next(x for x in api(f'/cuentas/{c}')['posiciones'] if x['simbolo'] == pos[0].upper())
            cuerpo['stop'] = p['precio_medio']
        elif pos[1:]:
            cuerpo['stop'] = pos[1]
        if 'trail' in op:
            cuerpo['trail_pct'] = op['trail']
        if 'objetivo' in op:
            cuerpo['objetivo'] = op['objetivo']
        api(f'/cuentas/{c}/stop', 'POST', cuerpo)
        mostrar_estado(api(f'/cuentas/{c}'))
    elif orden == 'ordenes':
        mostrar_estado(api(f'/cuentas/{cid()}'))
    elif orden == 'cancelar':
        o = api(f'/cuentas/{cid()}/ordenes/{int(pos[0])}', 'DELETE')
        print(f"Orden #{o['id']} {o['estado']}.")
    elif orden == 'tamano':
        q = {'s': pos[0], 'stop': pos[1], **({'entrada': op['entrada']} if 'entrada' in op else {}), **({'riesgo': op['riesgo']} if 'riesgo' in op else {})}
        r = api(f'/cuentas/{cid()}/tamano?' + urllib.parse.urlencode(q))
        print(f"Tamaño: {r['cantidad']} unidades · arriesgas {n(r['riesgo'])} ({r['riesgo_pct']}% del capital) · stop a {r['distancia_stop_pct']}% · posición {n(r['valor_posicion'])}"
              + (' · limitado por poder de compra' if r['limitado_por_poder_compra'] else ''))
    elif orden == 'diario':
        for t in api(f'/cuentas/{cid()}/diario')[:int(pos[0]) if pos else 10]:
            print(f"#{t['id']} {t['simbolo']} {t['direccion']} {t['estado']} · entrada {n(t['entrada'])} salida {n(t['salida'])} · P&L {s(t['pnl'])} · R {s(t['r'])} · "
                  f"{f(t['abierto'])} · setup {t['setup'] or '—'} · emoción {t['emocion'] or '—'} · plan {'—' if t['respeto_plan'] is None else 'sí' if t['respeto_plan'] else 'NO'}"
                  + (f" · nota: {t['nota']}" if t['nota'] else '') + (f" · lección: {t['leccion']}" if t['leccion'] else ''))
    elif orden == 'anotar':
        if 'respeto_plan' in op:
            op['respeto_plan'] = 1 if op['respeto_plan'].lower() in ('1', 'si', 'sí', 'true') else 0
        t = api(f'/cuentas/{cid()}/diario/{int(pos[0])}', 'PATCH', op)
        print(f"Trade #{t['id']} anotado.")
    elif orden == 'stats':
        x = api(f'/cuentas/{cid()}/estadisticas')
        if not x.get('trades'):
            print('Aún no hay operaciones cerradas.')
            return
        print(f"{x['trades']} trades · acierto {x['tasa_acierto']}% · factor de beneficio {x['factor_beneficio']} · esperanza {s(x['esperanza'])}/trade · R medio {x.get('r_medio')} · "
              f"neto {s(x['beneficio_neto'])} · DD máx {x['max_drawdown_pct']}% · ganancia media {n(x['ganancia_media'])} / pérdida media {n(x['perdida_media'])} · "
              f"rachas {x['racha_ganadora']}G/{x['racha_perdedora']}P · con stop {x['con_stop_pct']}% · diario anotado {x['anotados_pct']}%")
        for k, v in sorted(x['por_setup'].items(), key=lambda kv_: -kv_[1]['pnl']):
            print(f"  setup {k}: {v['trades']} trades, {v['ganadores']} ganadores, {s(v['pnl'])}")
    elif orden == 'examen':
        x = api(f'/cuentas/{cid()}/examen')
        print(f"¿Listo para dinero real? {x['cumplidos']}/{x['total']} — {'APROBADO' if x['aprobado'] else 'todavía no'}")
        for c in x['criterios']:
            print(f"  {'✅' if c['ok'] else '⬜'} {c['criterio']}: {c['valor']}")
        print(x['nota'])
    elif orden == 'equity':
        e = api(f'/cuentas/{cid()}/equity')
        paso = max(1, len(e) // 12)
        print(' → '.join(f"{time.strftime('%d/%m', time.localtime(p['ts']))} {n(p['valor'], 0)}" for p in e[::paso]))
    elif orden == 'estrategias':
        for k, v in api('/estrategias').items():
            print(f"{k}: {v['descripcion']} · parámetros {v['params']}")
    elif orden == 'backtest':
        params = {k: num(v) for k, v in op.items() if k not in ('intervalo', 'rango', 'stop_atr', 'objetivo_atr', 'tamano', 'cortos', 'capital', 'comision_pct', 'riesgo_pct', 'fraccion')}
        cuerpo = {'simbolo': pos[0], 'estrategia': pos[1] if len(pos) > 1 else 'cruce_medias', 'params': params, 'intervalo': op.get('intervalo', '1d'),
                  'rango': op.get('rango', '5y'), 'stop_atr': num(op.get('stop_atr', 0)), 'objetivo_atr': num(op.get('objetivo_atr', 0)), 'tamano': op.get('tamano', 'todo'),
                  'cortos': op.get('cortos') in ('1', 'si', 'sí', 'true'), 'capital': num(op.get('capital', 10000)), 'comision_pct': num(op.get('comision_pct', 0.05)),
                  'riesgo_pct': num(op.get('riesgo_pct', 1)), 'fraccion': num(op.get('fraccion', 100))}
        r = api('/backtest', 'POST', cuerpo)
        ref = r.get('referencia') or {}
        print(f"Backtest {r['simbolo']} · {r['estrategia']} {r['params']} · {r['velas']} velas {time.strftime('%d/%m/%Y', time.localtime(r['desde']))}–{time.strftime('%d/%m/%Y', time.localtime(r['hasta']))}")
        print(f"Retorno {s(r['retorno_pct'])}% (CAGR {s(r['cagr_pct'])}%) vs comprar y mantener {s(r['comprar_mantener_pct'])}% · DD máx {r['max_drawdown_pct']}% (B&H {ref.get('max_drawdown_pct')}%) · "
              f"Sharpe {r['sharpe']} (B&H {ref.get('sharpe')}) · Sortino {r['sortino']} · Calmar {r['calmar']}")
        if r.get('trades'):
            print(f"{r['trades']} trades · acierto {r['tasa_acierto']}% · factor de beneficio {r['factor_beneficio']} · esperanza {s(r['esperanza'])} · en mercado {r['tiempo_en_mercado_pct']}%")
        mc = r.get('montecarlo')
        if mc:
            print(f"Monte Carlo: DD mediano {mc['dd_mediano']}%, 95 % peor {mc['dd_95']}%, prob. de acabar perdiendo {mc['prob_perdida']}%")
    elif orden == 'optimizar':
        rangos = {k: [num(x) for x in v.split(',')] for k, v in op.items() if ',' in v}
        extra = {k: num(v) for k, v in op.items() if ',' not in v}
        r = api('/optimizar', 'POST', {'simbolo': pos[0], 'estrategia': pos[1], 'rangos': rangos, 'rango': extra.pop('rango', '5y'), **extra})
        print(f"{r['probadas']} combinaciones (70 % entreno / 30 % prueba, criterio {r['criterio']})")
        for t in r['top']:
            print(f"  {t['params']}: entreno {s(t['entreno']['retorno_pct'])}% Sharpe {t['entreno']['sharpe']} → PRUEBA {s(t['prueba']['retorno_pct'])}% Sharpe {t['prueba']['sharpe']}")
        if r['aviso']:
            print('⚠ ' + r['aviso'])
    elif orden == 'escaner':
        for x in api('/escaner' + (f'?s={urllib.parse.quote(pos[0])}' if pos else '')):
            if x.get('error'):
                print(f"{x['simbolo']}: error {x['error']}")
                continue
            print(f"{x['simbolo']} {n(x['precio'])} ({s(x['cambio_pct'])}% hoy, {s(x['rend_1m'])}% 1m) RSI {x['rsi14']} · {x['sesgo_tecnico']}" + (f" · {'; '.join(x['senales'])}" if x['senales'] else ''))
    elif orden == 'vigilar':
        print('Lista de vigilancia: ' + ', '.join(api('/vigilancia', 'POST', {'simbolo': pos[0]})))
    elif orden == 'olvidar':
        print('Lista de vigilancia: ' + ', '.join(api('/vigilancia/' + urllib.parse.quote(pos[0].upper()), 'DELETE')))
    elif orden == 'alerta':
        cond = {'cambio': 'cambio_pct'}.get(pos[1], pos[1])
        x = api('/alertas', 'POST', {'simbolo': pos[0], 'condicion': cond, 'valor': num(pos[2]), 'nota': op.get('nota')})
        print(f"Alerta #{x['id']}: {x['simbolo']} {x['condicion']} {x['valor']}")
    elif orden == 'alertas':
        for x in api('/alertas'):
            print(f"#{x['id']} {x['simbolo']} {x['condicion']} {x['valor']} · " + ('vigilando' if x['activa'] else f"disparada {f(x['disparada'])} a {n(x['precio_disparo'])}"))
    elif orden == 'avisos':
        av = api('/avisos?nuevos=1')
        print('\n'.join(f"{f(x['disparada'])} " + (x['nota'] if x['condicion'] == 'aviso' else f"🔔 {x['simbolo']} {x['condicion']} {x['valor']} → {n(x['precio_disparo'])}") for x in av) or 'Sin avisos nuevos.')
    elif orden == 'practica':
        c = api('/cuentas', 'POST', {'nombre': f'Práctica {pos[0].upper()}', 'capital': num(op.get('capital', 10000)),
                                     'replay': {'simbolo': pos[0], 'intervalo': pos[1] if len(pos) > 1 else '1d', 'rango': pos[2] if len(pos) > 2 else '2y', 'azar': True, 'calentamiento': 120}})
        api('/ajustes', 'POST', {'cuenta_defecto': c['id']})
        print(f"Práctica #{c['id']} lista y activa: {c['replay']['simbolo']} {c['replay']['intervalo']}, empiezas el {f(c['replay']['t'])} (vela {c['replay']['idx'] + 1}/{c['replay']['total']}).")
        mostrar_velas(api(f"/cuentas/{c['id']}/replay")['velas'])
    elif orden == 'avanzar':
        r = api(f'/cuentas/{cid()}/replay/avanzar', 'POST', {'pasos': int(pos[0]) if pos else 1})
        mostrar_velas(r['velas'], min(int(pos[0]) if pos else 1, 10) + 3)
        if r['ejecuciones']:
            print(f"{r['ejecuciones']} orden(es) ejecutada(s).")
        if r['fin']:
            print('FIN de la práctica: mira stats y examen.')
        mostrar_estado(api(f'/cuentas/{cid()}'))
    elif orden in ('agente', 'enjambre'):
        sub = pos[0].lower() if pos else 'estado'
        if sub == 'iniciar':  # enjambre iniciar [agentes] [capital] [meta] mercados=… hasta=…
            api('/enjambre/iniciar', 'POST', {'agentes': int(pos[1]) if len(pos) > 1 else 50, 'capital': num(pos[2]) if len(pos) > 2 else 1,
                                              'meta': num(pos[3]) if len(pos) > 3 else 100, 'mercados': op.get('mercados', 'cripto,acciones').split(','), 'hasta': op.get('hasta')})
        elif sub == 'parar':
            api('/enjambre/parar', 'POST')
        elif sub == 'informe':
            print(api('/enjambre/informe')['texto'])
            return
        elif sub == 'noticias':  # enjambre noticias [n]: lo que ve el analista de noticias en tiempo real
            d = api(f"/enjambre/noticias?n={pos[1] if len(pos) > 1 else 12}")
            print(d['resumen'])
            for x in d['noticias']:
                print(f"{f(x['ts'])} {x['impacto']:+.1f} (importancia {x['importancia']:.1f}) [{', '.join(x['simbolos']) or '—'}] {x['resumen'] or x['titulo']} · {x['fuente']}")
            for e in d['eventos'][:5]:
                print(f"Evento {f(e['ts'])}: {e['titulo']} ({e['impacto']})")
            return
        elif sub == 'lecciones':
            for l in api(f"/enjambre/lecciones?n={pos[1] if len(pos) > 1 else 15}"):
                print(f"{f(l['ts'])} [{l['tipo']}] {l['texto']}")
            return
        elif sub == 'agente':
            d = api(f'/enjambre/agente/{int(pos[1])}')
            g = d['genoma']
            print(f"{d['nombre']} (gen {d['generacion']}) · {d['estado']} · {d['ultimo']} · aptitud {d['aptitud']} en {d['trades_genoma']} trades · {d['intentos']} intentos · {d['metas']} metas")
            print(f"Sistema: velas {g['marco']} · {g['estrategia']} {g['p']} · stop {g['stop_atr']} ATR · objetivo {g['rr']}R · riesgo {g['riesgo_pct']}%")
            for l in d['lecciones'][:6]:
                print('  ' + l['texto'])
            return
        m = api('/enjambre/mapa')
        for nd in m['nodos']:
            k = nd.get('kpis') or {}
            print(f"Nodo {nd['nodo']}: {len(nd.get('agentes') or [])} agentes · {'operando' if k.get('activo') else 'parado'}"
                  + ('' if nd.get('local') else (' · en línea' if nd.get('en_linea') else ' · DESCONECTADO')) + f" · generación {k.get('generacion')} · {k.get('trades')} operaciones · R medio {k.get('r_medio')} · quiebras {k.get('quiebras')} · metas {k.get('metas')}")
        todos = sorted((dict(a, nodo=nd['nodo']) for nd in m['nodos'] for a in (nd.get('agentes') or []) if a.get('r_medio') is not None and a.get('trades', 0) >= 3), key=lambda a: -a['r_medio'])
        print('Mejores: ' + (', '.join(f"{a['nombre']} ({a['nodo']}) {a['r_medio']:+.2f}R {a['estrategia']} {a['marco']}" for a in todos[:5]) or '—'))
        print('Últimas lecciones: ' + ' | '.join(l['texto'] for l in m['lecciones'][:4]))
    elif orden == 'reglas':
        c = cid()
        if op:
            api(f'/cuentas/{c}', 'PATCH', {k: (v.lower() in ('1', 'si', 'sí', 'true') if k in ('exigir_stop', 'riesgo_estricto', 'permitir_cortos') else num(v)) for k, v in op.items()})
        print('Reglas: ' + ', '.join(f'{k}={v}' for k, v in api(f'/cuentas/{c}')['config'].items() if k != 'webhook'))
    else:
        sys.exit(f'ERROR: orden desconocida «{orden}». Ejecuta sin argumentos para ver la ayuda.')


def mostrar_velas(v, k=8):
    from_ = v[-k:]
    print('Últimas velas (fecha O/H/L/C):')
    for b in from_:
        print(f"  {f(b['t'])}  {n(b['o'])} / {n(b['h'])} / {n(b['l'])} / {n(b['c'])}")


if __name__ == '__main__':
    main(sys.argv[1:])
