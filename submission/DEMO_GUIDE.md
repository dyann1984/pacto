# Guía de la DEMO para los jueces

**https://pacto-pearl.vercel.app** — no hace falta registrarse ni instalar nada.

Duración: unos 5 minutos. Necesitarás **dos ventanas**: una normal para el cliente
y una de incógnito para el proveedor, porque son dos personas distintas.

---

## 1. Entrar sin registrarse (30 s)

En la página inicial, pulsa **«Explorar DEMO»**.

Entras como visitante anónimo. No es una maqueta: es una sesión real de Supabase
con su propio identificador, aislada por las mismas políticas de seguridad que
protegen a cualquier cuenta. Lo que crees aquí no lo ve nadie más.

## 2. Crear un acuerdo (1 min)

**«Crear Pacto»** y rellena:

- **Nombre:** `Rediseño de tienda en línea`
- **Alcance:** `Rediseñar la tienda, migrar el catálogo de 120 productos y
  entrenar al equipo. No incluye fotografía de producto ni contenidos.`
- **Importe:** `25000`

Fíjate en la barra de 5 pasos y en el panel **«Qué sigue»**: siempre hay una sola
acción pendiente, explicada en lenguaje normal.

## 3. Invitar al proveedor (1 min)

El panel pide invitar a un proveedor. Pulsa **«Generar enlace de invitación»** y
copia el enlace.

Es un enlace de un solo uso que caduca en 7 días. En la base de datos solo se
guarda su huella criptográfica, así que ni un administrador podría reconstruirlo.
Opcionalmente puedes restringirlo a un correo concreto.

> **Por qué importa:** antes, añadir a la otra parte exigía copiar un identificador
> interno de la base de datos. Ningún usuario real haría eso.

## 4. Unirse como proveedor (1 min)

Abre una **ventana de incógnito** y pega el enlace.

Verás el acuerdo —título, importe y alcance— **antes** de unirte. Pulsa
**«Continuar como visitante DEMO»** y después **«Unirme como proveedor»**.

Vuelve a abrir el mismo enlace: ya está usado y lo dice. Pruébalo también en una
tercera ventana: tampoco funciona.

## 5. Revisar y aceptar los dos (1 min)

- **Cliente:** «Enviar a revisión».
- **Proveedor:** «Aceptar versión 1». Verás *"Esperando la aceptación de la otra
  parte — 1 de 2"*.
- **Cliente:** «Aceptar versión 1». El acuerdo pasa a **Aceptado**.

Prueba a editar el acuerdo después: se crea una versión nueva y ambas partes
tienen que volver a aceptarla. Nadie queda atado a un texto que no aprobó.

## 6. Entrega, autorización y pago (1 min)

Aparece la sección **«Entregas y pagos»**.

- **Proveedor:** escribe la evidencia de entrega y pulsa «Presentar evidencia».
- **Cliente:** léela y pulsa **«Autorizar el pago de este hito»**.

Comprueba estas dos cosas, que son el núcleo de la propuesta:

- El **cliente no puede autorizar** sin evidencia previa del proveedor.
- El **proveedor no puede autorizar** su propio cobro: ese botón no existe para él.

Con credenciales de PayPal Sandbox configuradas, aquí aparece **«Pagar con PayPal»**,
que lleva a PayPal, el pagador aprueba, y el hito pasa a **Pagado** con su
comprobante. Sin ellas, la interfaz lo dice con claridad en vez de ofrecer un
botón que fallaría. Ver `PAYPAL_INTEGRATION.md`.

## 7. Cerrar y revisar el historial (30 s)

Ambas partes pulsan **«Confirmar cierre»**. Con las dos confirmaciones, el Pacto
queda **Cerrado**.

Baja hasta **«Actividad»**: cada acción está registrada con quién la hizo y cuándo.
Son personas y fechas, no identificadores técnicos.

---

## Qué probar si quieres forzar el sistema

| Intento | Qué ocurre |
|---|---|
| Abrir `/admin` | Redirige al login; con una cuenta normal, 404 |
| Abrir el Pacto de otro visitante | 404, sin filtrar que existe |
| Reutilizar un enlace de invitación | "Esta invitación ya se utilizó" |
| Aceptar tu propia invitación como cliente | Lo impide: hacen falta dos partes distintas |
| Pagar sin autorizar antes | Lo rechaza la base de datos, no la interfaz |
| Editar un acuerdo ya aceptado | Nueva versión; ambas partes deben aceptar otra vez |

## Qué NO está activo y por qué

- **Pago real en PayPal Sandbox:** faltan las credenciales. La integración está
  implementada y probada con dobles del API; ver `PAYPAL_INTEGRATION.md`.
- **Análisis con IA:** falta la clave, para no generar gasto. Implementado y
  probado; ver `AI_INTEGRATION.md`.

En ninguno de los dos casos se muestran resultados simulados como si fueran reales.
