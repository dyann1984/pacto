# Foundation architecture

Monolito modular Next.js App Router / React / TypeScript estricto. Servidor autentica con `auth.getUser()`; cada lectura/mutación verifica membresía y PostgreSQL aplica RLS. El cliente usa credenciales públicas y la sesión del usuario; no hay service_role ni sesión DEMO automática.

## Datos

User se vincula con `auth.users` y `profiles`. `pactos` contiene entorno DEMO y creador. `participants` contiene roles por Pacto, máximo un BUYER y un SELLER, identidades distintas. `agreements` versiona alcance e importe en centavos. Hitos y criterios pertenecen a una versión. `acceptances` registra usuario y timestamp de servidor. `audit_events` registra actor, acción y objeto desde funciones SQL.

Se conserva la versión ACCEPTED mientras una propuesta posterior permanece DRAFT/REVIEW. Al aceptar ambas partes la nueva versión, la anterior pasa a SUPERSEDED. Editar un borrador revoca sus aceptaciones. Los estados y escrituras están encapsulados en RPC; no se concede INSERT/UPDATE/DELETE a clientes.

## RLS y RPC

SELECT permite solo membresía para Pactos, participantes, acuerdos y audit trail; hitos, criterios y aceptaciones heredan pertenencia. Profiles es privado al usuario. Helpers SECURITY DEFINER usan search_path vacío y consultas totalmente cualificadas para evitar recursión de políticas. EXECUTE se revoca a PUBLIC y anon, se concede a authenticated.

RPC: create_pacto, add_seller, submit_agreement, accept_agreement y revise_agreement. Usan `auth.uid()` y nunca aceptan actor o payload de auditoría del cliente. Transacción única une cambio y evento. Aceptación bloquea el registro del acuerdo para serializar firmas. Cantidad/moneda y estados se validan de nuevo en PostgreSQL.

## Fase 2: cierre, cancelación e IA

- `pactos.status`: ACTIVE, CLOSED o CANCELLED. Todas las RPC de acuerdos (`add_seller`, `submit_agreement`, `accept_agreement`, `revise_agreement`) rechazan cambios con `PACTO_NOT_ACTIVE`.
- `confirm_closure`: requiere un acuerdo ACCEPTED y ningún borrador o revisión pendiente. Cada participante confirma una vez; con dos confirmaciones el Pacto pasa a CLOSED. Cualquier edición de alcance borra las confirmaciones.
- `cancel_pacto`: solo en ACTIVE, motivo de 10 a 500 caracteres, registrado en `pactos.status_reason` y en auditoría.
- `ai_analyses`: resultado validado, modelo, huella SHA-256 de la entrada y autor. Legible solo por participantes. Se registra con `record_ai_analysis`.
- Auditoría: `audit_events.detail` guarda la nota de cierre, el motivo de cancelación o el modelo de IA.
- Proveedor de IA: `src/lib/ai.ts`, Anthropic Messages API. Sin `ANTHROPIC_API_KEY` devuelve `NOT_CONFIGURED`.

## Fase 3: registro público, roles y panel administrativo

- Registro con correo y contraseña (`/sign-up`) y con Google OAuth (botón cliente + `/auth/callback`). Confirmación de correo, recuperación de contraseña (`/forgot-password`, `/reset-password`) y cierre de sesión. Un solo Route Handler (`/auth/callback`) intercambia el código PKCE para los tres flujos (confirmación, recuperación, OAuth), con una guarda contra redirecciones abiertas (`next` debe ser una ruta interna).
- `profiles.role`: `'user'` o `'admin'`, por defecto `'user'`. Se asigna en alta por el trigger `on_auth_user_created` (SECURITY DEFINER), nunca por el cliente ni por el formulario de registro — ningún valor enviado por quien se registra puede influir en el rol.
- `is_admin()`: helper SECURITY DEFINER que lee `profiles.role` para `auth.uid()`.
- RLS aditivo: políticas `admin_read_*` en `profiles`, `pactos`, `participants`, `agreements` y `audit_events` dan visibilidad total a `is_admin()`, sin reducir el aislamiento existente para usuarios normales (las políticas son OR, nunca reemplazan las anteriores).
- `admin_list_users()`: RPC SECURITY DEFINER que expone campos no sensibles de `auth.users` (correo, confirmación, últimos accesos) solo a administradores; nunca expone hashes de contraseña. `auth.users` no tiene ningún grant directo para clientes.
- Elevación a `admin`: migración controlada y separada (`202610090002_assign_owner_admin.sql`) que verifica UUID y correo exactos de `auth.users` antes de escribir; no modifica identidad ni contraseña. Es la única vía para obtener el rol; no existe ninguna acción de UI que lo conceda.
- `/admin`: protegido por `requireSession()` más verificación de `profiles.role==='admin'` (404, no redirección, para no revelar la ruta). Panel de solo lectura: usuarios registrados, Pactos y acuerdos con su estado, actividad y auditoría recientes.

## Matriz de comprobación conectada pendiente

Provisionar compradores A/B y proveedor S; crear Pacto A con A/S, Pacto B con B/A. Verificar en dos sesiones y con API/PostgREST:

| Identidad | Pacto A  | Pacto B  |
| --------- | -------- | -------- |
| A         | BUYER    | SELLER   |
| B         | Denegado | BUYER    |
| S         | SELLER   | Denegado |
| Anónimo   | Denegado | Denegado |

Cambiar URL, GET `/api/pactos/{id}`, argumentos de RPC y consultas directas a tablas hijas. Respuestas de recursos ajenos: 404 en aplicación, cero filas RLS, excepción NOT_FOUND en mutación. No existe control de seguridad basado solo en ocultar botones.

## Límites

- Un hito y criterio inicial; editor multi-hito posterior.
- Incorporación del proveedor por UUID de una identidad Auth ya provisionada; invitaciones y descubrimiento no implementados.
- No hay certificación de firma, verificación de proveedores ni garantía jurídica.
- No hay engine de archivos, IA, PayPal, jobs o cambios de alcance; se preservan límites de dominio para añadirlos.
- Auth y persistencia remotos requieren configuración y pruebas conectadas.
- Auditoría append-only para roles de aplicación; propietario DB sigue siendo privilegiado.
- Hardening adicional de CSP, límites por usuario y retención queda pendiente; no se declara producción-ready.
