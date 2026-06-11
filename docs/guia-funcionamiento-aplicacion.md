# Guia de Funcionamiento de ALFA-OMEGA

## 1. Que es ALFA-OMEGA

ALFA-OMEGA es una consola de trading y automatizacion que permite:

- Consultar instrumentos disponibles en un broker.
- Previsualizar y enviar ordenes protegidas con stop loss y take profit.
- Consultar ordenes abiertas, posiciones y ejecuciones confirmadas.
- Cancelar ordenes que todavia se encuentran activas.
- Configurar limites de riesgo.
- Registrar senales, operaciones locales, notificaciones y logs.
- Programar operaciones recurrentes y estrategias EMA cuando Supabase esta configurado.

La version actual funciona exclusivamente en modo **paper trading**. Las operaciones enviadas a IBKR utilizan una cuenta de simulacion y el sistema mantiene bloqueado el trading live.

## 2. Arquitectura y flujo de una orden

El dashboard nunca se conecta directamente con IBKR. Toda orden pasa por varias capas:

```text
Dashboard
  -> API
  -> Motor de riesgo
  -> Broker Gateway
  -> Adaptador IBKR o broker simulado
  -> IBKR Paper
```

El flujo de una orden es:

1. El operador selecciona broker, cuenta e instrumento.
2. Configura direccion, cantidad, precio limite, stop loss y take profit.
3. La API valida formato, modo paper y limites de riesgo.
4. El gateway selecciona el adaptador correspondiente.
5. El adaptador identifica y califica el contrato del instrumento.
6. La orden se envia al broker.
7. El sistema muestra el estado realmente reportado por el broker.

Una respuesta `submitted` o `PreSubmitted` no significa que la orden haya sido ejecutada. La ejecucion solo se confirma cuando el broker reporta `Filled` y aparece en el historial de ejecuciones.

## 3. Como iniciar la aplicacion

Desde la raiz del proyecto:

```bash
bun run dev
```

Servicios principales:

- Dashboard: `http://localhost:3000`
- API: `http://localhost:4000`
- Broker Gateway: `http://localhost:4100`
- IBKR Executor: `http://localhost:8080`
- TWS Paper: puerto habitual `4002`

Para que IBKR aparezca conectado, TWS o IB Gateway Paper debe estar abierto, autenticado y escuchando en el puerto configurado.

Comprobacion rapida:

```bash
lsof -nP -iTCP:4002 -sTCP:LISTEN
curl http://localhost:8080/health
curl http://localhost:4000/health
```

## 4. Navegacion y sidebar

El sidebar permanece oculto para dejar mas espacio a cada vista.

- Pulsa **Menu** para mostrarlo.
- Al seleccionar una vista, el sidebar se oculta automaticamente.
- Tambien puede cerrarse pulsando fuera del menu, usando **Cerrar** o presionando `Escape`.

Cada seccion tiene una vista independiente:

| Vista | Funcion |
| --- | --- |
| Dashboard | Resumen del estado general, controles manuales y metricas. |
| Automatizacion | Busqueda de activos, ordenes bracket, recurrencias y estrategias EMA. |
| Operaciones | Ordenes abiertas, cancelaciones, posiciones, ejecuciones e historial local. |
| Senales | Registro de oportunidades recibidas y su procesamiento. |
| Riesgo | Consulta y modificacion de limites operativos. |
| Brokers | Estado de adaptadores, ordenes y posiciones reportadas. |
| Notificaciones | Mensajes operativos pendientes, enviados o fallidos. |
| Logs | Auditoria tecnica, errores y respuestas internas. |

Los campos y botones incluyen una descripcion visible y un tooltip al pasar el cursor. Los botones que no pueden ejecutar una accion permanecen deshabilitados.

## 5. Dashboard

El Dashboard presenta un resumen de la aplicacion:

- **Estado del bot:** indica si el motor esta activo, pausado o bloqueado por riesgo.
- **Modo de trading:** muestra el modo operativo actual.
- **Broker:** indica si los adaptadores pueden responder.
- **Capital local y PnL diario:** pertenecen al motor local.
- **Ordenes broker:** cantidad de ordenes abiertas reportadas por IBKR.
- **Posiciones:** exposicion actual reportada por el broker.
- **Senales:** oportunidades recibidas por el sistema.
- **Operaciones locales:** registros del motor local, distintos del historial de IBKR.

La vista tambien contiene controles manuales, automatizacion, asistente y tablas resumidas. Para analizar un area con mas detalle, utiliza su vista independiente del sidebar.

## 6. Buscar y seleccionar instrumentos

En **Automatizacion**:

1. Selecciona el broker `IBKR` o `Simulated`.
2. Selecciona una cuenta paper.
3. Escribe el simbolo o nombre del instrumento.
4. Pulsa **Buscar**.
5. Selecciona uno de los resultados.

La busqueda muestra:

- Simbolo.
- Nombre.
- Clase de activo.
- Mercado principal.
- Moneda.
- Identificador interno del broker.
- Si el instrumento es operable o solo una referencia.

Es posible buscar acciones, ETFs e indices como:

- `AAPL`
- `S&P 500`
- `Nasdaq 100`
- `Dow Jones`
- `DAX`
- `FTSE 100`
- `Nikkei 225`

Un indice marcado como **referencia** no puede comprarse directamente. Para operarlo debe seleccionarse un instrumento negociable relacionado, como un ETF, futuro u opcion.

Para acciones y ETFs, ALFA-OMEGA utiliza enrutamiento `SMART` al enviar la orden a IBKR.

## 7. Crear una orden bracket

Una orden bracket tiene tres tramos:

1. **Entrada:** orden principal de compra o venta.
2. **Stop loss:** limita la perdida si el precio se mueve en contra.
3. **Take profit:** cierra la posicion al alcanzar el beneficio definido.

Campos:

| Campo | Descripcion |
| --- | --- |
| Direccion | `BUY` abre una compra y `SELL` abre una venta. |
| Cantidad | Numero de unidades que se desea operar. |
| Precio limite | Precio maximo de compra o minimo de venta aceptado. |
| Stop loss | Precio de salida de proteccion. |
| Take profit | Precio objetivo de beneficio. |

Reglas de precios:

- Para `BUY`: `stop loss < precio limite < take profit`.
- Para `SELL`: `take profit < precio limite < stop loss`.

### Preview bracket

**Preview bracket** valida:

- Que el instrumento exista en el broker.
- Que los precios sean coherentes.
- Que la cantidad y el valor no excedan los limites.
- Que el simbolo este permitido.
- Que IBKR acepte la estructura de cada tramo.

El preview no representa una ejecucion confirmada.

### Enviar bracket paper

**Enviar bracket paper** transmite los tres tramos a la cuenta paper seleccionada.

El sistema solo informa exito cuando TWS acepta la orden. Si IBKR la cancela o rechaza, el dashboard muestra el mensaje real del broker.

## 8. Estados de orden de IBKR

| Estado | Significado |
| --- | --- |
| `PendingSubmit` | La orden esta siendo enviada o validada. |
| `PreSubmitted` | IBKR acepto la orden, pero todavia no la envio al mercado. Es comun en mercados cerrados u ordenes hijas. |
| `Submitted` | La orden fue enviada al mercado y espera ejecucion. |
| `PartiallyFilled` | Una parte de la cantidad fue ejecutada. |
| `Filled` | La orden fue ejecutada completamente. |
| `PendingCancel` | La solicitud de cancelacion esta siendo procesada. |
| `Cancelled` | La orden fue cancelada. |
| `Inactive` | La orden no esta activa, normalmente por rechazo o configuracion invalida. |

Una orden no debe considerarse ejecutada hasta que aparezca como `Filled` en IBKR.

## 9. Consultar y cancelar operaciones

La vista **Operaciones** separa la informacion en varias pestanas:

- **En curso:** ordenes abiertas reportadas por el broker.
- **Posiciones:** exposicion y PnL actual.
- **Historial broker:** ejecuciones confirmadas por IBKR.
- **Senales:** oportunidades recibidas.
- **Operaciones:** registro local del motor.

Las ordenes en estados activos como `PendingSubmit`, `PreSubmitted` o `Submitted` muestran el boton **Cancelar**.

Al cancelar:

1. La aplicacion solicita confirmacion.
2. Envia la solicitud a IBKR.
3. IBKR decide si todavia es posible cancelarla.
4. El estado cambia a `PendingCancel` y despues a `Cancelled`.

En una orden bracket, cancelar la orden padre normalmente cancela tambien sus tramos hijos.

## 10. Limites de riesgo

La vista **Riesgo** permite modificar:

- Cantidad maxima por orden.
- Valor maximo por orden en USD.
- Numero maximo de ordenes diarias.
- Numero maximo de operaciones locales abiertas.
- Riesgo permitido por operacion.
- Riesgo diario maximo.
- Lista de simbolos permitidos.

La lista de simbolos se escribe separada por comas:

```text
AAPL, MSFT, TSLA
```

Si la lista queda vacia, se permite cualquier simbolo que supere las demas validaciones.

Errores comunes:

- `Quantity exceeds max order quantity (max_order_quantity)`: la cantidad supera el limite configurado.
- `Order notional exceeds maximum`: cantidad por precio supera el valor maximo permitido.
- `Symbol is not in the allowed symbols list (allowed_symbols)`: el simbolo no esta permitido.
- `Live trading is disabled`: se intento usar una cuenta o modo live.
- `Kill switch is active`: el sistema esta bloqueado por seguridad.

Los cambios se aplican a las siguientes ordenes y quedan registrados en Logs.

## 11. Automatizacion y estrategias EMA

Las recurrencias y estrategias requieren Supabase configurado. Si no esta disponible, sus botones aparecen deshabilitados.

### Recurrencias

Permiten programar compras o ventas repetidas:

- Cada determinados minutos, horas o dias.
- En horarios semanales.
- Con cantidad fija o monto definido.
- Con stop loss y take profit.

Cada ejecucion se valida como una orden nueva y utiliza una clave de idempotencia para evitar duplicados.

Si una ejecucion falla por mercado cerrado, riesgo, saldo o error del broker, se registra el resultado y se espera la siguiente ejecucion. No se reintenta automaticamente.

### Estrategia EMA

La estrategia EMA compara una media rapida y una media lenta sobre velas de una temporalidad definida.

Ejemplo:

- EMA rapida: 9.
- EMA lenta: 21.
- Temporalidad: `1h`.

La estrategia evalua una vez por vela y evita emitir varias ordenes por la misma senal.

Temporalidades soportadas:

```text
1m, 5m, 15m, 1h, 4h, 1d
```

## 12. Senales, notificaciones y logs

### Senales

Una senal representa una oportunidad detectada o recibida. No representa una ejecucion.

Puede estar:

- Pendiente.
- Procesada.
- Rechazada por riesgo.

### Notificaciones

Muestran mensajes generados por procesos operativos. Pueden estar pendientes, enviados o fallidos.

### Logs

Registran eventos tecnicos y de auditoria:

- Cambios de limites de riesgo.
- Envio y cancelacion de ordenes.
- Respuestas del broker.
- Errores internos.
- Decisiones de riesgo.

Ante un problema, revisa primero la vista **Logs** y despues el estado reportado en **Operaciones**.

## 13. Broker simulado e IBKR Paper

### Broker simulado

Se utiliza para probar el flujo de la aplicacion sin depender de TWS o IBKR.

### IBKR Paper

Envia operaciones a la cuenta paper configurada en TWS o IB Gateway. Estas ordenes deben aparecer en la interfaz de IBKR.

Condiciones necesarias:

- TWS o IB Gateway Paper abierto.
- API habilitada.
- Puerto y cuenta correctamente configurados.
- `IBKR_CONNECTION_MODE=tws`.
- `IBKR_DRY_RUN=false` para transmitir ordenes paper.
- `ALLOW_LIVE_TRADING=false`.

## 14. Persistencia de datos

ALFA-OMEGA puede utilizar:

- `data/local-db.json` para desarrollo local y registros simulados.
- Supabase como fuente de verdad para automatizacion, auditoria persistente y reconciliacion.

La programacion recurrente, estrategias EMA y reconciliacion operativa requieren Supabase.

## 15. Diagnostico rapido

### Broker aparece offline

Comprueba:

```bash
lsof -nP -iTCP:4002 -sTCP:LISTEN
curl http://localhost:8080/health
curl http://localhost:4000/api/brokers
```

### La orden no aparece en IBKR

1. Confirma que seleccionaste `IBKR` y no `Simulated`.
2. Confirma que la cuenta es paper.
3. Revisa el mensaje mostrado por el dashboard.
4. Revisa Logs.
5. Comprueba ordenes abiertas:

```bash
curl http://localhost:4000/api/trading/orders/open
```

### La orden aparece como PreSubmitted

IBKR acepto la orden, pero todavia no la envio al mercado. Puede deberse a que:

- El mercado esta cerrado.
- La orden principal espera condiciones de mercado.
- Es un tramo hijo que espera la ejecucion del padre.

### Un boton esta deshabilitado

Pasa el cursor sobre el boton para ver el motivo. Normalmente falta seleccionar un instrumento, completar valores validos o configurar Supabase.

## 16. Reglas de seguridad

- No se permite trading live.
- Toda orden se valida antes de enviarse.
- Las llamadas al broker se realizan desde servicios internos.
- Una orden enviada no se considera ejecutada hasta recibir `Filled`.
- Las acciones sensibles pueden protegerse con autenticacion y rol `operator`.
- Los errores y cambios operativos quedan auditados.

## 17. Validacion del proyecto

Comandos recomendados despues de realizar cambios:

```bash
bun test
bun run typecheck
bun run build
```

Documentacion tecnica adicional:

- `README.md`
- `docs/env-setup.md`
- `docs/programmed-multibroker-runbook.md`
- `docs/ibkr-web-api-runbook.md`
