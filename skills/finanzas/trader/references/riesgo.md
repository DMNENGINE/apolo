# Gestión de riesgo (lo que separa a un trader de un apostador)

## Las 6 reglas de la casa
1. **Riesgo fijo por operación: 0,5–1 % del capital.** Con 10.000 $, perder en un trade como mucho 50–100 $. Con 1 % hacen falta ~70 pérdidas seguidas para perder la mitad; con 10 %, solo 7.
2. **Siempre stop-loss, decidido ANTES de entrar.** El stop va donde la idea deja de ser válida (debajo del soporte, a 2 ATR…), no donde «duele menos».
3. **El tamaño sale del stop, no al revés.** Unidades = (capital × riesgo %) ÷ |entrada − stop|. Orden `tamano` del script.
4. **Pérdida diaria máxima (3 % por defecto).** Al llegar, la cuenta se bloquea hasta mañana. Evita el «trading de venganza».
5. **Relación beneficio/riesgo ≥ 2:1** en la mayoría de entradas: con objetivo a 2R basta acertar un 34 % para no perder.
6. **Nunca mover el stop en contra.** Solo a favor (breakeven, trailing).

## El múltiplo R
R = lo que arriesgas en un trade. Ganar 2R = ganar el doble de lo arriesgado. Pensar en R iguala trades de distinto tamaño. Esperanza = acierto × ganancia media − fallo × pérdida media; si es positiva y mantienes el riesgo fijo, el tiempo juega a tu favor.

## Drawdown
Caída desde el máximo del capital. Perder un 20 % exige ganar un 25 % para volver; perder un 50 % exige un 100 %. Por eso proteger el capital va antes que ganar.

| Pérdida | Ganancia necesaria para recuperar |
|---|---|
| 10 % | 11 % |
| 20 % | 25 % |
| 30 % | 43 % |
| 50 % | 100 % |

## Apalancamiento y cortos
El apalancamiento multiplica ganancias y pérdidas por igual. Empieza con 1 (sin margen). Los cortos tienen pérdida teórica ilimitada: stop obligatorio.

## Errores típicos
Sin stop · aumentar tamaño tras perder · promediar a la baja una perdedora · operar por aburrimiento o FOMO · cambiar las reglas en mitad de una mala racha · operar noticias sin plan.
