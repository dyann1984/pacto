# PACTO — instalación y ejecución

Acuerdos comerciales claros entre un cliente y un proveedor: se define el alcance,
ambas partes aceptan la misma versión, el proveedor presenta evidencia de entrega,
el cliente autoriza y el pago se procesa en **PayPal Sandbox**. Todo queda auditado.

- **Producción:** https://pacto-pearl.vercel.app
- **Stack:** Next.js 16 (App Router, Server Actions) · TypeScript · Supabase
  (Auth + Postgres + RLS) · Vercel · PayPal Orders v2 · API de Anthropic

> Las reglas del concurso exigen que todo el material de la entrega esté en
> inglés. Las versiones en inglés están en [`en/`](en/):
> [`en/PROJECT_DESCRIPTION.md`](en/PROJECT_DESCRIPTION.md) (descripción para
> Devpost) y [`en/JUDGE_INSTRUCTIONS.md`](en/JUDGE_INSTRUCTIONS.md)
> (instrucciones de prueba). El estado de la entrega, con las reglas oficiales ya
> verificadas, está en [`SUBMISSION_CHECKLIST.md`](SUBMISSION_CHECKLIST.md).

## Requisitos

- Node.js 22 o superior
- pnpm 11.28.5 (`corepack enable`)
- Un proyecto de Supabase

## Puesta en marcha

```bash
pnpm install
cp .env.example .env.local   # rellenar los valores
```

Variables mínimas para arrancar (`.env.local`):

| Variable | Obligatoria | Para qué sirve |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | sí | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | sí | Clave pública (`sb_publishable_…`), nunca `service_role` |
| `ANTHROPIC_API_KEY` | no | Activa el análisis del acuerdo con IA |
| `ANTHROPIC_MODEL` | no | Por defecto `claude-sonnet-5-5` |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | no | Activan el pago en PayPal **Sandbox** |
| `PAYPAL_WEBHOOK_ID` | no | Verifica los webhooks; sin él se rechazan |
| `SUPABASE_SERVICE_ROLE_KEY` | no | Solo para la conciliación por webhook y los scripts locales |

Sin las variables opcionales la aplicación funciona igual: la interfaz explica que
esas funciones no están activas en vez de ofrecer botones que fallarían.

Cómo obtener cada credencial, paso a paso: [`../docs/credentials-setup.md`](../docs/credentials-setup.md).
Para comprobar cuáles responden de verdad, con llamadas reales a cada proveedor:

```bash
pnpm check:integrations
```

## Base de datos

Aplicar las migraciones **en orden** como propietario de la base, desde el SQL
Editor de Supabase o con `supabase db query --linked -f <archivo>`:

```
supabase/migrations/202610020001_foundation.sql
supabase/migrations/202610080001_closure_cancellation_ai.sql
supabase/migrations/202610090001_roles_admin.sql
supabase/migrations/202610090002_assign_owner_admin.sql
supabase/migrations/202610100001_demo_example.sql
supabase/migrations/202610110001_invitations.sql
supabase/migrations/202610120001_milestones_payments.sql
```

`supabase/preflight.sql` es una consulta de solo lectura que indica cuáles están ya
aplicadas. Cada migración es una transacción única y aborta sola si se repite.
En `supabase/rollback/` están las reversiones de las dos últimas.

En **Authentication → URL Configuration** hay que añadir el dominio del despliegue
a *Site URL* y *Redirect URLs*, y activar *Anonymous sign-ins* para el modo DEMO.

## Ejecutar

```bash
pnpm dev          # desarrollo en http://127.0.0.1:3000
pnpm build        # compilación de producción
pnpm start        # servir la compilación
```

## Pruebas

```bash
pnpm typecheck
pnpm lint
pnpm test               # unitarias, RLS y autorización (Postgres real en memoria)
pnpm check:secrets      # ningún secreto en el cliente ni en el repositorio
pnpm check:integrations # qué integraciones externas responden de verdad
pnpm build && pnpm exec playwright test   # extremo a extremo
```

Las pruebas de extremo a extremo que usan visitantes DEMO no necesitan credenciales.
Para apuntarlas a un despliegue: `PACTO_E2E_BASE_URL=https://… pnpm exec playwright test`.
