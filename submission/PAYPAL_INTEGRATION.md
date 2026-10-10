# Integración con PayPal

## Alcance y límites

- **Solo entorno Sandbox.** `src/lib/paypal.ts` fija el host de Sandbox de forma
  incondicional: aunque alguien configure una base de producción, se ignora. No
  existe ninguna ruta de código que pueda generar un cobro real.
- **PACTO no es un escrow.** No retiene fondos ni actúa como intermediario
  regulado. El pago va del cliente al proveedor dentro de PayPal; PACTO registra
  qué se entregó, quién lo autorizó y cuál fue el resultado.
- **PACTO nunca ve datos de pago.** El pagador introduce sus datos en PayPal. En
  la base solo se guardan identificadores de orden y de captura.

## Recorrido del pago

```
1. El proveedor presenta evidencia      submit_milestone_evidence()   PENDING → EVIDENCE_SUBMITTED
2. El cliente revisa y AUTORIZA         approve_milestone()           → APPROVED
3. El cliente pulsa «Pagar con PayPal»  POST /v2/checkout/orders
4. Se registra la orden                 record_payment_order()        payments: CREATED
5. El PAGADOR APRUEBA en PayPal         (fuera de PACTO)
6. Vuelve a /pactos/[id]/pago           POST /v2/checkout/orders/{id}/capture
7. Se registra el resultado             record_payment_result()       → CAPTURED, hito → PAID
8. (Respaldo) webhook de PayPal         firma verificada → mismo record_payment_result()
```

El paso 2 es la **aprobación humana explícita** que el enunciado exige. No es una
comprobación de interfaz: `record_payment_order` rechaza con `APPROVAL_REQUIRED`
cualquier intento de pagar un hito que no esté en `APPROVED`.

## API utilizadas

| Operación | Endpoint |
|---|---|
| Token | `POST /v1/oauth2/token` (client credentials) |
| Crear orden | `POST /v2/checkout/orders` (intent `CAPTURE`) |
| Capturar | `POST /v2/checkout/orders/{id}/capture` |
| Consultar estado | `GET /v2/checkout/orders/{id}` |
| Verificar webhook | `POST /v1/notifications/verify-webhook-signature` |

## Prevención de pagos duplicados

Cuatro barreras independientes:

1. **Idempotencia en PayPal.** Cada creación de orden envía `PayPal-Request-Id`
   con el identificador del hito; cada captura envía `capture-<order_id>`. Repetir
   la petición devuelve el mismo resultado en vez de crear uno nuevo.
2. **Un pago vivo por hito.** Un índice único parcial en `payments` impide una
   segunda orden mientras otra está en `CREATED`, `APPROVED` o `CAPTURED`. Un
   pago cancelado o fallido sí libera el hito para reintentar.
3. **Captura idempotente en la base.** `record_payment_result` devuelve
   `ALREADY_CAPTURED` si el pago ya estaba capturado, sin duplicar la auditoría.
   Recargar la página de retorno no vuelve a cobrar.
4. **Importe no manipulable.** El importe se lee del hito en la base y la función
   lo vuelve a comparar: `AMOUNT_MISMATCH` si no coincide.

## Webhooks

- **Firma verificada siempre.** `verifyWebhook()` envía las cinco cabeceras de
  transmisión al verificador oficial de PayPal. Falla cerrado: sin
  `PAYPAL_WEBHOOK_ID`, sin cabeceras, con cuerpo no válido o ante cualquier error,
  el aviso se descarta con 401.
- **Eventos atendidos:** `PAYMENT.CAPTURE.COMPLETED` (marca pagado),
  `PAYMENT.CAPTURE.DENIED` y `PAYMENT.CAPTURE.REVERSED` (marcan fallido). Los
  avisos informativos se reconocen sin cambiar nada.
- **Papel secundario.** La captura normal ocurre en el retorno del pagador. El
  webhook cubre el caso de que esa vuelta se pierda.
- **Conciliación opcional.** El aviso llega sin sesión, así que escribir exige
  `SUPABASE_SERVICE_ROLE_KEY`. Sin esa clave el webhook verifica la firma,
  responde 200 y no cambia nada.

## Errores y reintentos

| Situación | Comportamiento |
|---|---|
| PayPal no responde o da error | Código corto en el registro del servidor; "No se pudo contactar con PayPal" |
| El pagador cancela en PayPal | Vuelve con el hito aún autorizado; puede reintentar |
| Captura rechazada (422) | El pago pasa a `FAILED`; el hito vuelve a poder pagarse |
| Retorno perdido | El webhook concilia, si está configurado |
| Página de retorno recargada | Se detecta `CAPTURED` y no se vuelve a capturar |

Los errores nunca incluyen el cuerpo de la respuesta de PayPal, que puede contener
datos del pagador: solo un código como `ORDER_HTTP_422`.

## Qué falta para una demostración real

Las credenciales. Con ellas, el recorrido funciona de extremo a extremo:

1. En developer.paypal.com → **Apps & Credentials → Sandbox**, crear una app.
2. Añadir en Vercel (tipo *Sensitive*, **nunca** con prefijo `NEXT_PUBLIC_`):
   `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`.
3. Crear un webhook apuntando a `https://<dominio>/api/paypal/webhook` con los
   eventos `PAYMENT.CAPTURE.*`, y añadir su id como `PAYPAL_WEBHOOK_ID`.
4. Opcional, para la conciliación por webhook: `SUPABASE_SERVICE_ROLE_KEY`.
5. Pagar con una **cuenta personal de Sandbox** (Testing Tools → Sandbox Accounts).

Hasta entonces la interfaz muestra "El pago con PayPal todavía no está activado"
en lugar de un botón que fallaría. **No se simulan pagos ni se presentan
resultados falsos como reales.**

## Estado de las pruebas

| Prueba | Tipo | Resultado |
|---|---|---|
| Crear orden: importe, divisa, idempotencia, URLs de retorno | Doble del API | PASS |
| Captura: identificador y clave de idempotencia | Doble del API | PASS |
| Consulta de estado | Doble del API | PASS |
| Errores de token, orden incompleta, captura 422 | Doble del API | PASS |
| Webhook auténtico aceptado | Doble del API | PASS |
| Webhook falsificado, sin id, sin cabeceras, JSON inválido, error | Doble del API | PASS |
| Nunca se sale del host de Sandbox | Doble del API | PASS |
| Autorización, duplicados, importes, idempotencia de captura | PostgreSQL real | PASS |
| Pago de extremo a extremo con cuenta Sandbox | Sandbox real | **NO EJECUTADA** (faltan credenciales) |
