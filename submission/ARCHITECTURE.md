# Arquitectura técnica

## Principio rector

**La autorización vive en la base de datos, no en la interfaz.** Cada regla se
aplica en PostgreSQL mediante Row Level Security y funciones `SECURITY DEFINER`.
La interfaz solo decide qué mostrar; si alguien envía una petición manipulada, la
base la rechaza igual.

Consecuencia práctica: el navegador solo recibe la clave publicable de Supabase,
que es pública por diseño. No existe una API propia con lógica de permisos que
pudiera quedar desincronizada de la base.

## Capas

```
Navegador  ──► Next.js (Server Components y Server Actions)  ──► Supabase Postgres
                      │                                              ▲
                      ├──► api.sandbox.paypal.com (Orders v2)        │
                      └──► api.anthropic.com (Messages)              │
                                                                     │
PayPal ──► /api/paypal/webhook (firma verificada) ───────────────────┘
```

- **Server Actions** para todo lo que escribe. No hay rutas de API propias que
  manipulen datos, salvo el webhook, que es un extremo público obligado.
- **`src/proxy.ts`** renueva la sesión en las rutas protegidas.
- **Las claves privadas** (PayPal, Anthropic, rol de servicio) solo se leen en
  `src/lib/`, nunca con el prefijo `NEXT_PUBLIC_`. Un script del repositorio
  (`pnpm check:secrets`) falla la compilación si alguna se filtra al cliente.

## Modelo de datos

| Tabla | Contenido |
|---|---|
| `profiles` | Rol de cada persona (`user` / `admin`) |
| `pactos` | El acuerdo: título, estado (`ACTIVE`/`CLOSED`/`CANCELLED`), motivo |
| `participants` | Comprador y proveedor; como máximo uno de cada por Pacto |
| `agreements` | Versiones del acuerdo: alcance, importe, estado |
| `milestones` | Entregables: importe, estado, evidencia, fechas |
| `acceptances` | Quién aceptó qué versión y cuándo |
| `closure_confirmations` | Confirmaciones de cierre, una por parte |
| `invitations` | Enlaces de invitación (solo el SHA-256 del token) |
| `payments` | Órdenes y capturas de PayPal Sandbox |
| `ai_analyses` | Análisis de IA registrados como evidencia |
| `audit_events` | Historial inalterable de todo lo anterior |

Invariantes impuestos por índices únicos, no por código:

- Un solo borrador o versión en revisión por Pacto.
- Una sola versión aceptada por Pacto.
- Un solo pago vivo por hito (índice parcial sobre los estados no terminales).
- Un token de invitación único.

## Máquina de estados

```
Acuerdo:  DRAFT ──► REVIEW ──► ACCEPTED ──► SUPERSEDED
Hito:     PENDING ──► EVIDENCE_SUBMITTED ──► APPROVED ──► PAID
Pacto:    ACTIVE ──► CLOSED | CANCELLED
```

Transiciones clave:

- `DRAFT → REVIEW` exige dos participantes y que los importes de los hitos sumen
  el total del acuerdo.
- `REVIEW → ACCEPTED` exige dos aceptaciones distintas.
- Editar un acuerdo aceptado crea una versión nueva, borra las confirmaciones de
  cierre y obliga a aceptar de nuevo.
- `EVIDENCE_SUBMITTED → APPROVED` solo lo hace el comprador.
- `APPROVED → PAID` solo ocurre tras una captura real en PayPal.

## Seguridad

- **Aislamiento:** `is_participant()` gobierna todas las lecturas. Un Pacto ajeno
  devuelve 404, sin filtrar su existencia.
- **Administración:** `/admin` exige sesión y rol; si no, devuelve 404 en vez de
  redirigir, para no revelar que la ruta existe. `is_admin()` gobierna las
  políticas de lectura ampliada.
- **DEMO:** las sesiones anónimas son usuarios reales de Supabase con su propio
  `auth.uid()`. Las aísla exactamente el mismo RLS. Un único Pacto marcado
  `is_demo_example` es legible por cualquiera, solo para lectura y solo porque lo
  marcó una migración; ningún cliente puede poner esa marca.
- **Invitaciones:** el enlace contiene un token aleatorio de 64 caracteres; en la
  base solo se guarda su SHA-256, y ni siquiera los participantes pueden leer esa
  columna. Caduca a los 7 días, es de un solo uso y puede restringirse a un correo.
- **Secretos:** nunca se registran valores de claves ni cuerpos de respuesta de
  proveedores externos; solo códigos cortos de error.

## Decisiones y sus motivos

- **Reglas en la base, no en el servidor.** Dos clientes (navegador y servidor)
  divergen con el tiempo; una política de RLS no.
- **PGlite en las pruebas.** Ejecutar las migraciones reales contra un PostgreSQL
  en memoria permite probar RLS de verdad en cada cambio.
- **Migraciones con guardia.** Cada una comprueba su prerrequisito y aborta si ya
  está aplicada, dentro de una sola transacción.
- **PayPal sin estado propio de sesión.** La orden se identifica por `order_id`,
  único en la base, lo que hace idempotente tanto el retorno del pagador como el
  webhook.
