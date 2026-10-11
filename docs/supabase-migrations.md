# Procedimiento de migraciones Supabase

Aplica solo al proyecto Supabase dedicado a PACTO. No usar una base ajena ni una con tablas homónimas.

## Orden

1. `supabase/preflight.sql`: solo lectura. Cada fila indica si un objeto ya existe.
2. Aplicar, en este orden, solo las migraciones cuyas filas del preflight sigan en `false`.
   Cada archivo comprueba su propio prerrequisito y aborta si ya está aplicado:

   | # | Archivo | Fila del preflight que pasa a `true` |
   |---|---|---|
   | 1 | `202610020001_foundation.sql` | `foundation: tabla participants` |
   | 2 | `202610080001_closure_cancellation_ai.sql` | `cierre: tabla closure_confirmations` |
   | 3 | `202610090001_roles_admin.sql` | `roles: rpc admin_list_users` |
   | 4 | `202610090002_assign_owner_admin.sql` | (se verifica aparte, ver el comentario del preflight) |
   | 5 | `202610100001_demo_example.sql` | `demo: rpc is_demo_pacto` |
   | 6 | `202610110001_invitations.sql` | `invitaciones: rpc accept_invitation` |
   | 7 | `202610120001_milestones_payments.sql` | `pagos: tabla payments` |
   | 8 | `202610130001_closure_requires_delivery.sql` | `cierre: confirm_closure exige entrega cumplida` |

3. `supabase/preflight.sql` de nuevo: todas las filas deben ser `true`.

### La migración 8 cambia dos reglas de negocio

`202610130001_closure_requires_delivery.sql` no crea objetos: reemplaza el cuerpo de
`confirm_closure` y `record_payment_result` para cerrar dos transiciones inválidas
reproducidas en auditoría.

- **Cierre:** ya no se puede confirmar el cierre mientras algún hito del acuerdo
  aceptado no esté `APPROVED` o `PAID` (código `DELIVERY_REQUIRED`). Los Pactos ya
  cerrados no se tocan: la RPC solo actúa sobre Pactos `ACTIVE`.
- **Pagos:** un `CAPTURED` ya no se acepta desde una sesión de usuario (código
  `CAPTURE_NOT_ALLOWED`); solo lo escribe el servidor sin sesión, con el rol de
  servicio. **Esto convierte `SUPABASE_SERVICE_ROLE_KEY` en obligatoria para que los
  pagos funcionen en el entorno desplegado** (ver `docs/credentials-setup.md`).

## Reversión

Hay reversa para las tres últimas migraciones, en `supabase/rollback/`. **Se aplican en
orden inverso al de instalación.** En particular, `202610120001_milestones_payments.down.sql`
se niega con `ROLLBACK_OUT_OF_ORDER` si la migración 8 sigue aplicada: retirar
`milestones.status` antes dejaría `confirm_closure` roto en tiempo de ejecución.

## Reglas de seguridad

- Ejecutar cada archivo en el SQL Editor como propietario del proyecto, pegando el contenido completo.
- Ambas migraciones abren una transacción (`begin;`) y se detienen si ya fueron aplicadas (`MIGRATION_ALREADY_APPLIED`) o si falta un prerrequisito (`PREREQUISITE_MISSING`). Un error revierte todo el archivo.
- **Tras cualquier error, ejecutar `rollback;` antes de otra consulta.** PostgreSQL deja la sesión en transacción abortada hasta ese punto.
- Ante un fallo: `rollback;`, revisar el preflight y no borrar datos. Las reversas existentes están en `supabase/rollback/` y se aplican en orden inverso (ver arriba).
- No desactivar RLS ni cambiar la confirmación de correo para "hacer pasar" una comprobación.
- No usar la clave `service_role` en la aplicación ni en `NEXT_PUBLIC_*`.

## Verificación posterior

```bash
corepack pnpm@11.28.5 check:demo-users
```

Solo imprime estados y códigos de error. Requiere `.env.local` con las variables DEMO. Salida 0 significa ambos usuarios operativos con correo confirmado. Salida 2 significa credenciales inválidas; 3, correo sin confirmar.

## Verificación de compatibilidad (local)

`tests/migrations.test.ts` aplica las migraciones sobre PostgreSQL embebido y comprueba:

- el orden correcto de toda la cadena y el preflight en cada estado intermedio;
- que un reintento de cualquiera de ellas aborta sin cambios parciales;
- que ninguna se ejecuta sin su prerrequisito;
- que las reversas devuelven el esquema a su estado anterior sin borrar Pactos, y que la de pagos se niega con `ROLLBACK_OUT_OF_ORDER` mientras la regla de entrega siga aplicada;
- que `closure_confirmations` y `ai_analyses` no tienen privilegios de escritura para `anon` ni `authenticated`.

Estas pruebas no sustituyen la ejecución contra el proyecto remoto.
