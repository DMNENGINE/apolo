# Trading y autopiloto simulado

DMN Trader se instala como **paquete** (`DMNENGINE/dmn-trader`, Skills → Explorar). El paquete arranca y vigila el motor
en este equipo y aporta la pestaña **Trading** del panel. El núcleo de APOLO (este documento) supervisa el autopiloto
**simulado** y es el único que puede autorizar el **piloto con dinero real** (sección al final). El enjambre toma sus
decisiones en DMN Trader; este módulo no añade estrategias.

## Uso

1. Instalar el paquete DMN Trader (necesita Python 3.10+) y abrir **Trading** en el menú del panel (también en Mission Control).
2. Revisar el estado de la central. Si ya tiene un enjambre activo sin supervisión de APOLO, el arranque está bloqueado. Pararlo desde su botón solo si se quiere sustituir esa ejecución por un plan supervisado.
3. Definir agentes, mercados, capital simulado por agente, meta, duración máxima y pérdida acumulada máxima. El capital total asignado es agentes multiplicado por capital por agente. Los valores iniciales del formulario son editables; no son recomendaciones para dinero real.
4. Pulsar «Activar autopiloto simulado» y aprobar la solicitud de permiso de APOLO, que muestra la central y el plan exacto. El modo automático general no elimina esta aprobación.
5. Una vez confirmado el plan por la central, el enjambre opera solo. APOLO consulta su estado cada cinco segundos y solicita parar por duración, pérdida, cambio de parámetros, fallo de supervisión o pánico. No reinicia automáticamente una ejecución terminada ni reenvía un arranque incierto.

El control afecta exclusivamente al nodo que la central identifica como `local`. Un segundo nodo que aparezca en el mapa no queda controlado por ese hecho. La interfaz distingue ejecución remota existente de autopiloto supervisado.

## Parada y recuperación

El botón Parar está disponible durante el pánico y no necesita un permiso adicional. Una parada solo se certifica después de enviar la solicitud y leer `kpis.activo: false` en el nodo local. Si falla la comunicación o la central sigue activa, se guarda `parada_no_confirmada` y se bloquea un nuevo arranque.

El estado se conserva en `trading-autopiloto.json`. Después de reiniciar, se recupera la supervisión de una ejecución registrada y se intenta parar una ejecución incierta o vencida; no se repite `iniciar`. El cierre normal de la aplicación intenta parar un autopiloto supervisado antes de salir. Las decisiones y resultados se registran en la auditoría.

**Guardia de la central:** el arranque ahora exige `modo: "simulado"` y la capacidad `dmn-guardia/1`. La central persiste los límites y los comprueba aunque APOLO se cierre. Su estado y sesión deben coincidir con el plan aprobado. Se verifica también `parada_confirmada`, que requiere ausencia de posiciones pendientes. Una central antigua puede consultarse, pero no puede recibir un nuevo arranque supervisado.

**Límite esencial:** ni la guardia Python ni APOLO garantizan un máximo matemático de pérdidas frente a saltos de precio, cierre fallido o caída de la central. La supervisión usa sondeo y precios externos. La actualización debe instalarse y cargarse en la central efectiva, no basta copiarla al PC. Los pilotos reales y el AddOn de NinjaTrader necesitan su validación independiente.

## Configuración y credenciales

El destino es el motor que arranca el paquete: `<datos>/plugins-datos/dmn-trader/destino.json` (solo `http://127.0.0.1:<puerto>`) con el token en la bóveda (`plugin:dmn-trader:token`). Sin paquete, se usa la configuración antigua `skills/trader/_datos/trader.json` (central externa). Se admiten HTTPS o HTTP en direcciones privadas, sin usuario/contraseña, consulta ni fragmento en la URL. No se siguen redirecciones. Las respuestas tienen límite de 4 MiB y validación de JSON y esquema.

El archivo de configuración y el estado del autopiloto se clasifican como sensibles para las herramientas. La credencial se registra para redacción y se copia a la bóveda, verificando su lectura. Puede usarse `tokenRef: "boveda:trading:central"` cuando todos los clientes estén migrados. El token original no se elimina automáticamente: el cliente Python instalado todavía lo necesita. No se alteró ese cliente externo ni su archivo de datos en esta reparación.

## API local de APOLO

- `GET /v1/trading/mapa`: mapa validado y `_autopiloto` con contrato `apolo-trading/1`.
- `GET /v1/trading/autopiloto`: estado del supervisor, sin credenciales.
- `POST /v1/trading/iniciar`: solo simulado, permiso obligatorio, rechazo si ya hay una ejecución activa o incierta.
- `POST /v1/trading/parar`: parada y comprobación del estado remoto.
- `GET /v1/trading/real`: estado del piloto con dinero real (activo, límites, saldo, operaciones, aviso del bucle).
- `POST /v1/trading/real {"activo": false}`: pausa las entradas reales, sin pedir permiso. La gestión de lo abierto sigue.
- `POST /v1/trading/real {"activo": true, "limites": {"por_op_sol", "perdida_max_sol", "max_ops_dia", "reserva_sol"}, "confirmacion": "ACTIVO DINERO REAL"}`:
  límites en rango (0,005–0,1 SOL por operación; pérdida 0,001–10 SOL; 1–50 operaciones/día; reserva 0–1 SOL), sin pánico y con
  **aprobación explícita** del usuario (isla, móvil o Discord; nunca automática). Después se comprueba que el motor aplicó
  exactamente esos límites (si no, se pausa) y se audita. El pánico pausa el real si el motor del paquete corre en este equipo.

El agente tiene `trading_autopiloto` (estado/iniciar/parar, siempre simulado y con esta guardia) y las herramientas del paquete
`trader_consultar` / `trader_operar` (mesa simulada). **El dinero real no tiene herramienta**: solo la pestaña del panel.

Ejemplo de cuerpo de inicio (requiere aprobación; no se ejecuta con este documento):

```json
{"modo":"simulado","agentes":50,"capital":1,"meta":100,"mercados":["cripto","acciones"],"hasta":null,"duracionMin":60,"perdidaMaxPct":10}
```

La aprobación queda vinculada a los parámetros y destino capturados; un cambio de central, credencial o estado de pánico antes de ejecutar invalida el arranque. Se verifica después que la central aplicó capital, meta, mercados, horario y número de agentes. Una discrepancia provoca un intento de parada, con resultado incierto si no puede comprobarse.

El panel requiere el contrato nuevo tanto de APOLO como de la central para habilitar el arranque; recargar solamente la interfaz sobre un núcleo o una central antiguos no habilita un control sin estas protecciones. El código del PC de DMN Trader está en `C:\Users\yosoy\Projects\dmn-trader`; su documentación `GUARDIA-APOLO.md` describe pruebas y despliegue.
