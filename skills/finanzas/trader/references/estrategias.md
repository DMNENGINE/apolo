# Estrategias del backtester

| Clave | Idea | Funciona mejor en | Parámetros |
|---|---|---|---|
| `cruce_medias` | Entra largo cuando la media rápida cruza encima de la lenta; sale (o corto) al revés. | Tendencias largas | rapida, lenta, tipo (ema/sma) |
| `rsi_reversion` | Compra con RSI < sobreventa, vende/corto con RSI > sobrecompra, sale cerca de 50. | Mercados laterales | n, sobreventa, sobrecompra |
| `macd` | Cruce de la línea MACD con su señal. | Tendencias medias | rapida, lenta, senal |
| `bollinger` | Compra bajo la banda inferior, vende sobre la superior, cierra al volver a la media. | Rangos | n, k |
| `donchian` | Tortugas: compra la ruptura del máximo de N velas, sale con el mínimo de M. | Tendencias fuertes (materias primas, cripto) | entrada, salida |
| `rsi2` | Connors: en tendencia alcista (precio > SMA200) compra caídas fuertes (RSI(2) < 10), sale al superar la SMA5. | Índices (SPY, QQQ) | tendencia, umbral, salida |
| `comprar_mantener` | Referencia: comprar el primer día y no tocar. | — | — |

Opciones de ejecución: `stop_atr` y `objetivo_atr` (stop/objetivo a N × ATR, revisados dentro de cada vela; si toca los dos, cuenta el stop), `tamano` = todo | fraccion | riesgo (riesgo % con el stop ATR), `cortos=1`, comisión y deslizamiento.

## Cómo leer un backtest sin engañarse
- **Compárala siempre con comprar y mantener.** Si gana menos con más trabajo, no aporta (salvo que reduzca mucho el drawdown: mira Sharpe y Calmar).
- **Sharpe** > 1 bueno, > 2 excelente (sospecha si es mucho más). **Calmar** = CAGR ÷ drawdown.
- **Pocos trades (< 30) = poca evidencia.** Prueba otros símbolos y periodos.
- **Optimizar engaña:** el optimizador separa 70 % entreno / 30 % prueba. Si en prueba rinde mucho peor, es sobreajuste. Prefiere parámetros «redondos» que funcionen en una zona amplia, no un pico aislado.
- **Monte Carlo:** baraja el orden de los trades. El drawdown del 95 % peor es lo que deberías estar preparado para aguantar.
- El backtest no ve deslizamientos extremos, huecos de noticias ni tu psicología. En real, espera menos.
- Ejecución honesta: señal al cierre, entrada en la apertura de la siguiente vela (sin mirar al futuro).
