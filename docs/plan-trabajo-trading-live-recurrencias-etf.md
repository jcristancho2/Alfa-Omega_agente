# Plan de Trabajo: Trading Live, Recurrencias, Historial y ETFs

## 1. Objetivo

Organizar ALFA-OMEGA como una plataforma operativa que permita:

1. Lanzar operaciones live desde la aplicacion.
2. Programar operaciones recurrentes.
3. Mantener un historial propio reconciliado con el broker.
4. Cancelar operaciones activas.
5. Buscar y filtrar ETFs disponibles en el broker.

La habilitacion de trading live sera la ultima etapa. Primero debe demostrarse que el mismo flujo funciona de extremo a extremo en paper sin ordenes perdidas, duplicadas o mostradas con estados incorrectos.

## 2. Estado Actual

| Capacidad | Estado actual | Brecha principal |
| --- | --- | --- |
| Ordenes IBKR paper | Funcional para ordenes limite y bracket | El flujo v2 fuerza `paper` y no esta preparado para live. |
| Trading live | Bloqueado intencionalmente | Faltan controles, aprobacion reforzada y separacion de cuentas. |
| Recurrencias | Backend y tablas parcialmente implementados | Requiere Supabase, formulario completo, pruebas y observabilidad. |
| Historial broker | Consulta ejecuciones de la sesion | Falta persistencia historica consolidada y reconciliacion robusta. |
| Cancelacion | Funcional para ordenes activas IBKR | Falta unificar cancelacion multi-broker y persistir cada resultado. |
| Busqueda ETF | Devuelve instrumentos encontrados | Falta filtrado dedicado por ETF, moneda, mercado y operabilidad. |

## 3. Principios de Arquitectura

- `apps/api` sera el unico punto publico para crear, programar o cancelar operaciones.
- `apps/broker-gateway` sera la frontera neutral para cualquier broker.
- `apps/ibkr-executor` sera el unico servicio autorizado para comunicarse con IBKR.
- Supabase sera la fuente de verdad de ordenes, ejecuciones, recurrencias y auditoria.
- El estado mostrado en la aplicacion debe provenir del broker o del reconciliador, no de una suposicion local.
- Toda operacion debe tener una clave de idempotencia.
- Paper y live utilizaran cuentas, configuraciones, permisos y limites separados.
- Ninguna orden live se enviara sin autenticacion de operador y confirmacion explicita.

## 4. Arquitectura Objetivo

```text
Dashboard
  -> API + autenticacion operador
      -> risk-engine
      -> Supabase: orden creada
      -> broker-gateway
          -> ibkr-executor
              -> IBKR Paper o Live

trading-orchestrator
  -> procesa recurrencias
  -> envia siempre mediante API
  -> reconcilia ordenes, ejecuciones y cancelaciones
  -> actualiza Supabase

Supabase Realtime
  -> actualiza Dashboard
```

## 5. Fases de Implementacion

### Fase 0. Estabilizar contratos y persistencia

Objetivo: asegurar que cualquier operacion pueda rastrearse desde la aplicacion hasta el broker.

Tareas:

- Convertir Supabase en requisito obligatorio para operaciones programadas y live.
- Crear una migracion nueva para permitir `paper` y `live` en:
  - `broker_accounts`.
  - `trade_orders`.
  - `recurring_schedules`.
- Agregar a `trade_orders`:
  - `client_order_id`.
  - `account_mode`.
  - `submitted_at`.
  - `cancel_requested_at`.
  - `cancelled_at`.
  - `filled_at`.
  - `last_reconciled_at`.
  - `broker_status`.
  - `error_code`.
  - `error_message`.
- Agregar una tabla `broker_executions` con identificador unico del broker.
- Agregar una tabla `operator_audit_events`.
- Normalizar correctamente los IDs de la orden padre y cada tramo bracket.
- Crear repositorios compartidos para evitar que API y orchestrator escriban estados de forma diferente.
- Evitar que una respuesta HTTP exitosa marque automaticamente una orden como ejecutada.

Criterios de aceptacion:

- Cada envio genera primero un registro `created`.
- Cada orden enviada tiene identificador local, clave idempotente e identificador del broker.
- Los estados solo avanzan mediante eventos confirmados.
- Repetir la misma solicitud no crea una segunda orden.

### Fase 1. Historial reconciliado con el broker

Objetivo: mostrar en ALFA-OMEGA el mismo comportamiento observable en IBKR.

Tareas:

- Ampliar el reconciliador para consultar cada 3 segundos:
  - Ordenes abiertas.
  - Estado de ordenes conocidas.
  - Ejecuciones.
  - Posiciones.
- Persistir ejecuciones nuevas usando el ID unico de ejecucion del broker.
- Mapear estados IBKR a estados normalizados:
  - `created`.
  - `submitted`.
  - `partially_filled`.
  - `filled`.
  - `cancelled`.
  - `rejected`.
  - `failed`.
- Distinguir claramente:
  - Ordenes creadas desde ALFA-OMEGA.
  - Ordenes detectadas en IBKR pero creadas externamente.
- Crear endpoints:
  - `GET /api/orders`
  - `GET /api/orders/:id`
  - `GET /api/orders/:id/events`
  - `GET /api/executions`
  - `GET /api/positions`
- Crear filtros de historial por:
  - Cuenta.
  - Broker.
  - Paper/live.
  - Simbolo.
  - Estado.
  - Fecha.
  - Origen manual/recurrente/estrategia/externo.
- Publicar actualizaciones mediante Supabase Realtime.
- Mantener polling como respaldo.

Criterios de aceptacion:

- Una orden lanzada desde la aplicacion aparece en IBKR y en el historial local.
- Una ejecucion confirmada en IBKR aparece una sola vez en ALFA-OMEGA.
- Los fills parciales actualizan cantidad ejecutada y restante.
- Los reinicios de servicios no pierden el seguimiento.

### Fase 2. Cancelacion robusta

Objetivo: cancelar ordenes activas y conservar evidencia completa del resultado.

Tareas:

- Crear endpoint neutral:
  - `DELETE /api/orders/:id`
- Resolver desde el ID local:
  - Broker.
  - Cuenta.
  - ID de orden del broker.
  - Tramos bracket relacionados.
- Registrar `cancel_requested` antes de contactar al broker.
- Confirmar `cancelled` solamente cuando el broker lo reporte.
- Para brackets:
  - Cancelar el padre cuando siga pendiente.
  - Cancelar los hijos restantes cuando corresponda.
  - No intentar cancelar tramos ya ejecutados.
- Agregar opcion de cancelar todas las ordenes abiertas de una cuenta, protegida por confirmacion reforzada.
- Mostrar mensajes claros cuando la orden ya fue ejecutada o no admite cancelacion.

Criterios de aceptacion:

- El boton solo esta habilitado para estados cancelables.
- La aplicacion no muestra `Cancelled` antes de confirmacion del broker.
- Cada solicitud y respuesta de cancelacion queda auditada.
- Cancelar un bracket no deja tramos activos inesperados.

### Fase 3. Programacion de operaciones recurrentes

Objetivo: permitir crear y administrar recurrencias fiables.

Tareas backend:

- Completar contrato de recurrencia con:
  - Broker.
  - Cuenta.
  - Modo paper/live.
  - Instrumento completo.
  - Compra o venta.
  - Cantidad fija o monto.
  - Orden simple o bracket.
  - Zona horaria.
  - Intervalo o calendario semanal.
  - Fecha de inicio y fecha opcional de finalizacion.
- Mantener idempotencia por `schedule_id + fecha programada`.
- Bloquear ejecuciones concurrentes del mismo schedule.
- Registrar cada intento en `schedule_runs`.
- Validar riesgo y saldo en cada ejecucion.
- No reintentar automaticamente una orden rechazada.
- Permitir pausar, reanudar, editar y cancelar recurrencias.

Tareas dashboard:

- Reemplazar el boton fijo **Programar diario** por un formulario completo.
- Mostrar proxima ejecucion, ultima ejecucion y resultado.
- Mostrar historial de ejecuciones por recurrencia.
- Permitir filtrar recurrencias por estado, cuenta, simbolo y modo.

Criterios de aceptacion:

- Una recurrencia genera como maximo una orden por fecha programada.
- Pausar una recurrencia evita nuevas ejecuciones.
- Cada ejecucion puede rastrearse hasta su orden e historial del broker.
- Un error queda registrado y la recurrencia espera la siguiente fecha.

### Fase 4. Catalogo y filtros ETF

Objetivo: buscar ETFs operables disponibles en el broker con filtros utiles.

Tareas:

- Extender `BrokerInstrument` con:
  - `assetClass`.
  - `primaryExchange`.
  - `currency`.
  - `country`.
  - `isTradable`.
  - `isFractional`.
  - `minTick`.
  - `tradingClass`.
  - `underlyingSymbol` cuando exista.
  - Metadata del broker.
- Crear endpoint de busqueda filtrada:

```text
GET /api/brokers/:brokerId/instruments
  ?q=sp500
  &assetClass=ETF
  &currency=USD
  &exchange=ARCA
  &tradable=true
  &accountId=...
  &page=1
  &limit=25
```

- Implementar filtros en gateway y adaptador IBKR.
- Calificar contratos antes de mostrarlos como operables.
- Guardar instrumentos consultados en `broker_instruments` con fecha de actualizacion.
- Crear en dashboard:
  - Filtro por clase `ETF`.
  - Moneda.
  - Exchange.
  - Operables/no operables.
  - Busqueda por nombre o simbolo.
  - Favoritos.
  - Paginacion.
- Diferenciar ETF, accion e indice de referencia.

Criterios de aceptacion:

- Seleccionar `ETF` excluye acciones e indices.
- Los resultados mostrados como operables pueden calificarse en IBKR.
- El instrumento seleccionado conserva moneda, exchange e identificador correctos al crear la orden.

### Fase 5. Preparacion para trading live

Objetivo: preparar el sistema para dinero real sin habilitarlo todavia.

Tareas obligatorias:

- Separar completamente cuentas paper y live.
- Detectar el modo real de cada cuenta desde el broker; no inferirlo desde el dashboard.
- Añadir configuracion por cuenta:
  - `enabled`.
  - `allow_live_trading`.
  - Limite por orden.
  - Limite diario.
  - Simbolos permitidos.
  - Horarios permitidos.
- Requerir autenticacion Supabase y rol `operator`.
- Crear rol adicional `live_trader`.
- Exigir confirmacion reforzada para live:
  - Vista previa obligatoria.
  - Resumen final de cuenta, simbolo, lado, cantidad y maximo riesgo.
  - Texto de confirmacion manual.
  - Token de preview de corta duracion y uso unico.
- Agregar kill switch live independiente.
- Agregar limites live mas restrictivos que paper.
- Validar antes de enviar:
  - Saldo disponible.
  - Posicion vendible.
  - Mercado abierto.
  - Precio reciente.
  - Cantidad minima e incremento.
  - Notional.
  - Perdida diaria.
  - Numero de operaciones.
- Deshabilitar recurrencias live durante la primera salida.
- Crear alertas para:
  - Orden rechazada.
  - Desconexion del broker.
  - Diferencia entre estado local y broker.
  - Perdida diaria cercana al limite.
- Realizar una prueba de marcha blanca donde se procesa todo el flujo live pero el envio final permanece bloqueado.

Criterios de aceptacion:

- Ningun usuario sin rol `live_trader` puede crear o cancelar ordenes live.
- Ninguna orden live puede enviarse sin preview vigente.
- El kill switch bloquea nuevas ordenes y recurrencias live.
- Todos los intentos live, aprobados o rechazados, quedan auditados.

### Fase 6. Habilitacion gradual de trading live

Objetivo: habilitar live con exposicion controlada.

Orden recomendado:

1. Habilitar una sola cuenta live.
2. Permitir una lista reducida de ETFs liquidos.
3. Permitir exclusivamente ordenes `LMT`.
4. Mantener cantidad maxima de una unidad y notional muy bajo.
5. Permitir solo operaciones manuales.
6. Observar y reconciliar durante un periodo definido.
7. Habilitar brackets live despues de validar ordenes simples.
8. Habilitar recurrencias live solo tras una revision independiente.

Condiciones para avanzar:

- Cero ordenes duplicadas.
- Cero ordenes aceptadas por el broker sin registro local.
- Cero estados locales falsamente marcados como ejecutados.
- Cancelaciones confirmadas correctamente.
- Auditoria completa de cada accion.

## 6. Cambios Requeridos por Componente

### `packages/trading-types`

- Extender cuentas, instrumentos, ordenes y filtros.
- Agregar tipos de eventos, ejecuciones persistidas y confirmacion live.
- Separar capacidades del broker por modo y tipo de activo.

### `packages/risk-engine`

- Agregar limites por cuenta y modo.
- Validar saldo, posiciones, perdida diaria, horario y frescura de precio.
- Mantener politicas live independientes.

### `apps/api`

- Unificar los endpoints antiguos y v2.
- Persistir la orden antes de enviarla.
- Implementar preview tokens para live.
- Exponer historial, eventos, ejecuciones y cancelacion neutral.

### `apps/broker-gateway`

- Permitir `paper` y `live` segun capacidades reales.
- Aplicar filtros de instrumentos.
- Normalizar IDs, estados, ejecuciones y cancelaciones.

### `apps/ibkr-executor`

- Detectar modo de cuenta.
- Mantener contratos completos y enrutamiento correcto.
- Normalizar estados IBKR.
- Exponer historial y ejecuciones con identificadores estables.

### `apps/trading-orchestrator`

- Usar bloqueos e idempotencia transaccional.
- Reconciliar historiales y fills.
- Mantener recurrencias live deshabilitadas hasta la fase final.

### `apps/dashboard`

- Separar visualmente paper y live.
- Mostrar advertencias persistentes en live.
- Crear filtros ETF.
- Crear formulario completo de recurrencias.
- Mostrar historial reconciliado y linea de tiempo por orden.

## 7. Prioridad Recomendada

| Prioridad | Entrega | Motivo |
| --- | --- | --- |
| P0 | Persistencia, IDs y reconciliacion | Evita ordenes perdidas, duplicadas o con estados falsos. |
| P0 | Autenticacion, auditoria y kill switch | Requisito obligatorio antes de live. |
| P1 | Historial consolidado y cancelacion robusta | Permite controlar operaciones ya enviadas. |
| P1 | Recurrencias paper completas | Valida automatizacion sin riesgo real. |
| P1 | Filtros y catalogo ETF | Mejora seleccion segura de instrumentos. |
| P2 | Preparacion live y marcha blanca | Valida controles sin enviar dinero real. |
| P2 | Live manual limitado | Primera habilitacion con exposicion reducida. |
| P3 | Brackets y recurrencias live | Solo despues de evidencia operativa suficiente. |

## 8. Plan de Entregas

### Entrega 1: Fundacion operativa

- Migraciones nuevas.
- Repositorios de persistencia.
- IDs de orden y ejecucion normalizados.
- Reconciliador robusto.
- Historial consolidado.

### Entrega 2: Control del operador

- Cancelacion neutral y auditada.
- Vista de detalle y eventos de cada orden.
- Filtros de historial.
- Realtime con polling de respaldo.

### Entrega 3: Automatizacion paper

- Formulario completo de recurrencias.
- Pausar, reanudar, editar y cancelar.
- Historial de ejecuciones programadas.
- Pruebas de idempotencia y zona horaria.

### Entrega 4: Catalogo ETF

- Contrato de filtros.
- Filtros IBKR y gateway.
- Catalogo persistido.
- Interfaz de busqueda y favoritos.

### Entrega 5: Preparacion live

- Cuentas y permisos live.
- Preview token y confirmacion reforzada.
- Limites live y kill switch.
- Marcha blanca.

### Entrega 6: Live limitado

- Ordenes manuales LMT.
- Una cuenta.
- ETFs permitidos.
- Limites bajos.
- Revision posterior a cada sesion.

## 9. Pruebas Obligatorias

- Contratos compartidos contra broker simulado e IBKR mock.
- Idempotencia ante solicitudes repetidas y reinicios.
- Reconciliacion de `PreSubmitted`, `Submitted`, fills parciales, `Filled`, `Cancelled` y `Rejected`.
- Persistencia de IDs padre e hijos bracket.
- Cancelacion antes y despues de un fill parcial.
- Recurrencias por intervalo, semanal y cambio de zona horaria.
- Filtros ETF por clase, moneda, exchange y operabilidad.
- Autorizacion por roles `operator` y `live_trader`.
- Kill switch bajo concurrencia.
- Prueba end-to-end:

```text
buscar ETF
-> seleccionar cuenta
-> preview
-> crear orden
-> verla en IBKR
-> reconciliar estado
-> cancelar
-> confirmar cancelacion en IBKR
-> consultar historial y auditoria
```

## 10. Definicion de Terminado

La aplicacion estara correctamente organizada para estos objetivos cuando:

- Toda orden tenga trazabilidad completa entre ALFA-OMEGA e IBKR.
- El historial sobreviva reinicios y refleje eventos reales del broker.
- Las cancelaciones sean confirmadas y auditadas.
- Las recurrencias paper sean idempotentes y administrables.
- Los ETFs puedan buscarse mediante filtros utiles.
- Live permanezca bloqueado hasta superar todas las puertas de seguridad.
- La primera habilitacion live sea manual, limitada, reversible y observable.

