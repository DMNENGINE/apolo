---
name: trader
description: Mesa de trading SIMULADO con datos reales de mercado (DMN Trader). APOLO consulta precios y análisis técnico de acciones, ETF, índices, cripto, divisas y materias primas; abre y cierra operaciones simuladas (mercado, límite, stop, trailing, stop-loss/take-profit), calcula el tamaño por riesgo, lleva el diario de operaciones, hace backtests y optimiza estrategias, vigila alertas, entrena en modo práctica (replay vela a vela) y dice si el usuario está listo para operar con dinero real. Úsala cuando hablen de bolsa, trading, acciones, cripto, forex, "¿cómo va X?", "compra/vende X", "mi cartera", "mis posiciones", backtest, estrategia, diario de trading, "practicar trading" o "¿estoy listo para operar en real?".
license: MIT
metadata:
  apolo:
    version: 1.0.0
    autor: DMN / APOLO
    disparadores: [trader, trading, tradear, bolsa, acciones, cripto, bitcoin, forex, mi cartera, mis posiciones, cómo va, como va, cotización, cotizacion, precio de, compra, vende, cierra la posición, stop loss, take profit, backtest, estrategia de trading, diario de trading, practicar trading, modo práctica, replay, escáner, alerta de precio, estoy listo para operar, dmn trader]
---

# Trader (simulador profesional con datos reales)

Todo el dinero aquí es **simulado**; los precios son **reales** (Yahoo Finance; acciones con unos segundos o minutos de retraso, cripto casi en tiempo real). El objetivo es que el usuario aprenda a operar con disciplina **antes** de arriesgar dinero real.

Usa `scripts/trader.py` con `ejecutar_script_skill` (`nombre: trader`, `script: scripts/trader.py`, `args: [...]`). Habla por HTTP con el servidor DMN Trader (por defecto `http://127.0.0.1:8777`; si está en otro sitio, el usuario lo pone en `_datos/trader.json` → `{"url": "...", "token": "..."}` con `anotar_skill`). Si responde «DMN Trader no responde», dile que lo arranque con `iniciar.bat` (carpeta `dmn-trader`) y que el panel está en esa misma dirección.

## Órdenes del script
- **Mercado:** `["precio","AAPL,BTC-USD"]` · `["analisis","NVDA"]` (o `["analisis","NVDA","60m"]`) · `["buscar","tesla"]` (símbolos + noticias) · `["escaner"]` (lista de vigilancia) · `["vigilar","AMD"]` · `["olvidar","AMD"]`
- **Cuenta:** `["estado"]` · `["cuentas"]` · `["usar","2"]` · `["nueva","Swing","5000"]` · `["reglas"]` / `["reglas","riesgo_max_pct=1","perdida_diaria_max_pct=3","exigir_stop=1"]` · `["reiniciar"]` (¡borra todo, confirma antes!)
- **Operar:** `["comprar","AAPL","10","sl=180","tp=210","setup=Pullback a la media","nota=rebote en SMA50"]`; importe en vez de cantidad: `"$500"`; límite: `"limite=185"`; stop de entrada: `"stop=190"`; trailing: `"trail=3"`. Igual con `vender` (abre corto o reduce un largo).
- **Gestionar:** `["cerrar","AAPL"]` · `["cerrar","AAPL","50"]` · `["cerrar","*"]` (todo) · `["stop","AAPL","182"]` · `["stop","AAPL","be"]` (a breakeven) · `["stop","AAPL","trail=4"]` · `["stop","AAPL","objetivo=215"]` · `["ordenes"]` · `["cancelar","12"]`
- **Riesgo:** `["tamano","AAPL","180"]` → unidades para arriesgar su % máximo con ese stop (`entrada=`, `riesgo=` opcionales).
- **Diario:** `["diario","10"]` · `["anotar","7","emocion=ansioso","respeto_plan=no","leccion=moví el stop"]` (campos: setup, nota, emocion, etiquetas, leccion, respeto_plan) · `["stats"]` · `["equity"]` · `["examen"]`
- **Backtest:** `["estrategias"]` · `["backtest","SPY","rsi2","stop_atr=2","rango=10y"]` · `["optimizar","QQQ","cruce_medias","rapida=10,20,30","lenta=50,100,200"]`. Estrategias: cruce_medias, rsi_reversion, macd, bollinger, donchian, rsi2, comprar_mantener.
- **Alertas:** `["alerta","BTC-USD","menor","75000","nota=zona de compra"]` (mayor | menor | cambio %) · `["alertas"]` · `["avisos"]` (stops saltados, alertas, bloqueos)
- **Práctica (replay):** `["practica","TSLA","1d","2y"]` crea una cuenta de práctica en un punto al azar del pasado y la pone activa · `["avanzar","1"]` avanza velas (las órdenes se ejecutan en la vela siguiente) · para volver a la cuenta normal: `["usar","<id>"]`.

Símbolos al estilo Yahoo: acciones `AAPL`, europeas `SAP.DE` / `SAN.MC`, índices `^GSPC` `^IXIC`, cripto `BTC-USD`, divisas `EURUSD=X`, futuros/materias primas `GC=F` (oro) `CL=F` (petróleo). Si no sabes el símbolo, usa `buscar`.

## El reto de APOLO (tu propio agente que aprende)
APOLO tiene su propia cuenta («APOLO · Reto») y un agente en el servidor que opera SOLO, de día y de noche, con microoperaciones simuladas (cripto 24 h; acciones con la bolsa abierta). Empieza con poco (p. ej. 1 $) y busca una meta (100 $). Cada operación perdida pasa una **autopsia** (costes, stop dentro del ruido, devolvió la ganancia, contra tendencia, volatilidad, sin continuidad…) con su **arreglo**; si quiebra, **prueba varias soluciones en datos reales recientes** y empieza otro intento con la mejor. Sus horas y símbolos perdedores se bloquean solos.
- `["agente","iniciar","1","100","mercados=cripto,acciones","hasta=07:00"]` (sin `hasta` sigue hasta que lo pares; `hasta=8` = 8 horas)
- `["agente"]` estado · `["agente","informe"]` resumen de la sesión (úsalo por la mañana: «¿qué tal la noche?») · `["agente","lecciones","10"]` · `["agente","intentos"]` · `["agente","parar"]`
- Al contar el informe: intentos, mejor capital, por qué quebró, qué aprendió y qué cambió. Sé honesto: convertir 1 $ en 100 $ es un ×100; lo normal es que quiebre muchas veces. El valor está en las lecciones. Las lecciones útiles para el usuario guárdalas con `recordar`.
- Panel: pestaña «🤖 APOLO» del panel web.

## Cómo actuar
1. **Datos antes que opinión.** Para «¿cómo va X?» llama a `precio` o `analisis` y cuenta los datos en corto (precio, % hoy, tendencia, RSI, soportes/resistencias). Nunca inventes precios ni noticias.
2. **No eres asesor financiero.** No digas «compra X» ni prometas resultados. Puedes explicar lo que dicen los indicadores, los pros y contras de un plan y preguntar «¿cuál es tu tesis?». Si pregunta por dinero real, recuérdale que esto es formación, no consejo.
3. **El usuario decide y ejecuta.** Solo envías órdenes cuando él lo pide claramente («compra 10 de Apple con stop en 180»). Si falta algo importante, pregunta UNA vez: ¿dónde está el stop? Si no lo sabe, propón `analisis` (stop técnico a 2 ATR) y `tamano` para que arriesgue solo su % máximo.
4. **Disciplina primero.** Si una orden se rechaza por riesgo o por pérdida diaria, **no** busques cómo saltarte la regla: explica por qué existe y da el tamaño correcto. Si quiere cambiar sus reglas, que lo haga en frío (`reglas`), no en mitad de una pérdida.
5. **Cada trade cerrado → diario.** Tras un cierre, pregúntale en una frase: setup, cómo se sintió, si respetó el plan y qué aprendió, y guárdalo con `anotar`. Esto es lo que más le hará mejorar.
6. **Revisión semanal** (si la pide o es domingo): `stats` + `diario` → 3 cosas: qué setup funciona, qué error se repite, una regla para la semana. Puedes guardarla con `recordar`.
7. **Modo práctica como entrenador:** tras `practica`, enséñale las últimas velas, pregúntale qué haría (comprar, vender, esperar, dónde el stop), ejecuta lo que decida y `avanzar`. No reveles el futuro: tú tampoco lo ves. Al terminar, `stats` + feedback honesto.
8. **¿Listo para real?** Usa `examen`. Si no aprueba, di qué criterios faltan. Si aprueba, recomienda empezar con muy poco dinero y las mismas reglas.
9. **Por voz:** frases cortas, sin tablas ni símbolos raros; redondea («Apple va a 343, sube un 1,3 % hoy»).

## Material de apoyo (léelo con `leer_recurso_skill`)
- `references/riesgo.md` — reglas de gestión de riesgo, tamaño de posición, R, drawdown.
- `references/estrategias.md` — qué hace cada estrategia del backtester y cómo leer un backtest sin engañarse.
- `references/plan-aprendizaje.md` — ruta de 8 semanas de simulado a real, rutina diaria y psicología.
- `references/glosario.md` — términos (ATR, RSI, MACD, R, MFE/MAE, factor de beneficio…).
