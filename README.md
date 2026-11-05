# PACTO

**AI Commerce. Real Results.**

Convierte un acuerdo informal en un recorrido que ambas partes pueden probar: se
define el alcance, la IA lo revisa antes de que nadie se comprometa, comprador y
proveedor aceptan la misma versión, el proveedor presenta evidencia de entrega,
el comprador **autoriza explícitamente** y solo entonces se puede pagar con
PayPal Sandbox. Cada decisión queda en un historial que ninguna de las partes
puede alterar.

- **Demostración pública:** https://pacto-pearl.vercel.app
- **Para evaluadores:** [`submission/en/JUDGE_INSTRUCTIONS.md`](submission/en/JUDGE_INSTRUCTIONS.md) · [`submission/DEMO_GUIDE.md`](submission/DEMO_GUIDE.md)
- **Concurso:** PayPal AI Hackathon — ver [`submission/`](submission/)
- **Licencia:** MIT ([`LICENSE`](LICENSE))

> El producto está en español y los importes en pesos mexicanos, por el mercado
> al que se dirige. Los materiales de la entrega están en inglés, en
> [`submission/en/`](submission/en/), como exigen las reglas del concurso.

## Probarlo sin registrarse

Pulsa **«Modo Juez»** en la portada. PACTO prepara dos identidades DEMO reales e
independientes en el mismo navegador —una comprador, otra proveedor— y una barra
superior te deja cambiar de parte con un botón. No es una simulación: cada
identidad es un usuario real de la base de datos con su propio `auth.uid()`, y el
servidor aplica las mismas políticas RLS a las dos. Compruébalo: como proveedor,
el botón de autorizar el pago no existe.

También está **«Explorar DEMO»**, que entra como un único visitante anónimo.

## Qué incluye

- **Autenticación** con Supabase Auth y sesiones SSR. Registro con correo y
  contraseña, confirmación, recuperación y cierre de sesión. Sesiones anónimas
  para la demostración. El botón de Google existe y refleja honestamente que el
  proveedor está deshabilitado (`docs/google-oauth-setup.md`).
- **Roles `user`/`admin`.** Todo registro nuevo recibe `user` por un trigger de
  base de datos; `admin` solo se asigna mediante una migración controlada, nunca
  desde el formulario ni desde la interfaz.
- **`/admin`**: panel de solo lectura exclusivo para administradores. RLS lo
  exige también a nivel de base de datos, no solo en la pantalla.
- **Pactos** con participantes BUYER/SELLER y acuerdos versionados.
- **Invitaciones**: el comprador genera un enlace seguro de un solo uso que
  caduca en 7 días y puede restringirse a un correo concreto. Solo se almacena su
  hash: ni un administrador puede reconstruirlo.
- **Revisión y aceptación** por ambas partes. Cualquier cambio posterior crea una
  versión nueva que hay que volver a aceptar.
- **Hitos, evidencia y pagos**: el proveedor presenta evidencia de entrega, el
  comprador la revisa y la autoriza, y solo un hito `APPROVED` puede pagarse. Un
  proveedor no puede aprobar su propio cobro, y el importe se lee del hito en la
  base de datos, nunca del formulario.
- **PayPal Orders v2**, exclusivamente en **Sandbox**: órdenes idempotentes,
  captura, consulta de estado y webhooks verificados que fallan cerrados. El host
  de Sandbox está fijado en el código: no puede generar un cobro real.
- **Cierre** con doble confirmación y **cancelación** unilateral con motivo de 10
  a 500 caracteres. Ambas son definitivas.
- **Análisis de IA** (`src/lib/ai.ts`): llama a la API de Anthropic con la clave
  del servidor, valida la salida contra un esquema estricto y registra el
  resultado con modelo, huella SHA-256 de la entrada y autor. Sin clave, informa
  `NOT_CONFIGURED`: no muestra resultados simulados.
- **Historial**: `audit_events` registra cada acción con actor, fecha y detalle.

La IA nunca modifica un acuerdo, nunca acepta por nadie y nunca autoriza un pago.
No es una promesa redactada: lo impide la base de datos.

## Requisitos

- Node.js 22 o superior.
- pnpm 11.28.5. Si `pnpm` no está en el PATH, usar `corepack pnpm@11.28.5`.
- Un proyecto Supabase dedicado a PACTO.

## Configuración

```powershell
Copy-Item .env.example .env.local
# Completar .env.local en la máquina local. Nunca subir ese archivo.
```

| Variable | Obligatoria | Uso |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sí | Clave pública (`sb_publishable_…`), nunca `service_role` |
| `ANTHROPIC_API_KEY` | Para la IA | Solo servidor; sin prefijo `NEXT_PUBLIC_` |
| `ANTHROPIC_MODEL` | No | Por defecto `claude-sonnet-5-5` |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | Para el pago | Credenciales **Sandbox** |
| `PAYPAL_WEBHOOK_ID` | Para los webhooks | Sin él se rechazan, a propósito |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Solo para scripts locales y la conciliación por webhook |
| `PACTO_DEMO_EXAMPLE_ID` | No | Pacto público de ejemplo |

Sin las variables opcionales la aplicación funciona igual: la interfaz explica
que esas funciones no están activas en vez de ofrecer botones que fallarían.

Cómo obtener cada credencial: [`docs/credentials-setup.md`](docs/credentials-setup.md).
Para comprobar cuáles están vivas, con llamadas reales a cada proveedor:

```powershell
corepack pnpm@11.28.5 check:integrations
```

## Base de datos

Aplicar **en orden** desde el SQL Editor de Supabase, como propietario del
proyecto:

1. `supabase/migrations/202610020001_foundation.sql`
2. `supabase/migrations/202610080001_closure_cancellation_ai.sql`
3. `supabase/migrations/202610090001_roles_admin.sql`
4. `supabase/migrations/202610090002_assign_owner_admin.sql` — asigna `admin` a
   una única cuenta verificada; editar el UUID y el correo antes de usarla en
   otro proyecto
5. `supabase/migrations/202610100001_demo_example.sql`
6. `supabase/migrations/202610110001_invitations.sql`
7. `supabase/migrations/202610120001_milestones_payments.sql`

`supabase/preflight.sql` es una consulta de solo lectura que indica cuáles están
ya aplicadas. Cada migración es una transacción única y aborta sola si se repite,
así que un segundo intento no deja nada a medias. En `supabase/rollback/` están
las reversiones de las dos últimas.

RLS está activo en todas las tablas. Los clientes no tienen `INSERT`, `UPDATE` ni
`DELETE`: todas las escrituras pasan por funciones RPC `SECURITY DEFINER` que
usan `auth.uid()`.

En **Authentication → URL Configuration** hay que añadir el dominio del
despliegue a *Site URL* y *Redirect URLs*. En **Sign In / Providers** debe estar
activado *Anonymous sign-ins*, del que dependen la DEMO y el Modo Juez.

## Ejecutar

```powershell
corepack pnpm@11.28.5 install --frozen-lockfile
corepack pnpm@11.28.5 dev     # http://127.0.0.1:3000
corepack pnpm@11.28.5 build
corepack pnpm@11.28.5 start
```

## Comprobaciones

```powershell
corepack pnpm@11.28.5 lint
corepack pnpm@11.28.5 typecheck
corepack pnpm@11.28.5 test            # 152 pruebas: dominio, autorización y RLS
corepack pnpm@11.28.5 check:secrets   # ningún secreto en el cliente ni en el repo
corepack pnpm@11.28.5 check:integrations
corepack pnpm@11.28.5 build
corepack pnpm@11.28.5 exec playwright test   # 33 pruebas de extremo a extremo
```

`pnpm test` cubre:

- `tests/domain.test.ts`, `tests/journey.test.ts`, `tests/account.test.ts`:
  invariantes del dominio y del recorrido.
- `tests/authorization.test.ts`, `tests/api-idor.test.ts`: autorización y acceso
  HTTP entre usuarios.
- `tests/rls.test.ts`, `tests/closure-ai.rls.test.ts`,
  `tests/roles-admin.rls.test.ts`, `tests/demo-example.rls.test.ts`,
  `tests/invitations.rls.test.ts`, `tests/payments.rls.test.ts`: las políticas RLS
  y las RPC reales contra un PostgreSQL embebido (PGlite).
- `tests/migrations.test.ts`: orden, transaccionalidad y reversión de las
  migraciones.
- `tests/agreement-analysis.test.ts`, `tests/paypal.test.ts`: prompt, validación
  de salida y llamadas a los proveedores con `fetch` simulado (sin red).

Las pruebas de PGlite ejecutan el SQL real, así que las políticas de seguridad se
prueban de verdad y no con dobles. Aun así **no sustituyen** la verificación
contra el Supabase remoto.

Las pruebas E2E que usan visitantes DEMO no necesitan credenciales. Las de
`tests/e2e/flows.spec.ts` sí (`PACTO_DEMO_*`) y se omiten sin ellas.

> **Cuidado con el cupo de sesiones anónimas.** Supabase limita los accesos
> anónimos por hora y por dirección IP (30 por defecto). La suite completa crea
> unas 19 entre visitantes DEMO y Modo Juez, así que **cabe una ejecución por
> hora, no dos seguidas**. Al agotarse, las pruebas fallan con «Demasiadas
> sesiones de prueba en la última hora»: es el límite, no una regresión. Para
> iterar más rápido, sube el límite en Supabase → Authentication → Rate Limits,
> o usa un proyecto Supabase aparte para las pruebas.
>
> Las capturas de `tests/e2e/shots.spec.ts` quedan fuera de la suite por el mismo
> motivo; se generan con `PACTO_E2E_SHOTS=1`.

Para apuntarlas a un despliegue:

```powershell
$env:PACTO_E2E_BASE_URL="https://…"; corepack pnpm@11.28.5 exec playwright test
```

## Estructura

- `src/domain`: entidades, invariantes, recorrido y análisis de IA (prompt y
  esquema de salida), sin dependencias de UI.
- `src/application`: lectura autorizada del Pacto.
- `src/lib`: cliente Supabase SSR, sesión validada, proveedor de IA y cliente de
  PayPal (solo servidor); sesión del Modo Juez (solo navegador).
- `src/app`: pantallas, Server Actions, endpoint de lectura y webhook de PayPal.
- `src/components`: barra del Modo Juez, tablero de hitos, invitación y formularios.
- `src/proxy.ts`: renovación de cookies; no es el control de autorización.
- `supabase/migrations`: esquema, RLS, RPC transaccionales y auditoría.
- `supabase/rollback`: reversiones de las dos últimas migraciones.
- `tests`: dominio, autorización, IDOR HTTP, RLS en PostgreSQL, migraciones, IA,
  PayPal y recorridos E2E en navegador.
- `submission/`: materiales del concurso; `submission/en/` en inglés.
- `docs/`: arquitectura, despliegue, migraciones, credenciales y guía de jueces.
- `.github/workflows/ci.yml`: lint, typecheck, pruebas y build en cada push y
  pull request.

## Límites conocidos

- Un solo hito y criterio por versión; el editor multi-hito queda para una fase
  posterior.
- La cancelación es unilateral (decisión de producto documentada); el cierre
  requiere a ambas partes.
- Los análisis de IA se registran tal como los envía la aplicación. Un
  participante autenticado con acceso directo a la RPC `record_ai_analysis`
  podría registrar un resultado manual; la huella y el modelo permiten detectarlo
  en la auditoría, pero no lo impiden.
- PACTO no retiene fondos ni actúa como escrow: el dinero va del comprador al
  proveedor dentro de PayPal, y PACTO registra el resultado.
- No hay certificación de firma electrónica ni asesoría jurídica.
- El registro público por correo depende del servicio de correo integrado de
  Supabase, limitado a 2 correos por hora. Para abrirlo al público haría falta un
  SMTP propio (`docs/pending-public-launch.md`).
- El registro público por correo también depende del cupo horario del correo de
  Supabase. Al agotarse, la pantalla lo explica y remite a la DEMO, que no
  necesita correo, pero no se puede crear una cuenta hasta la hora siguiente.
