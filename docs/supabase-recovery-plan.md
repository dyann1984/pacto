# Plan de recuperación de Supabase — PACTO (2026-11-05)

Estado: **investigación terminada, sin recursos creados ni modificados.**

## Hallazgos

| Comprobación | Resultado |
|---|---|
| Proyecto objetivo | `qmfwilyarxnomyufnwwv` (en `.env.local`, `supabase/.temp/project-ref` y en el bundle de producción de `pacto-pearl.vercel.app`) |
| DNS `qmfwilyarxnomyufnwwv.supabase.co` y `db.…` | No resuelve |
| `supabase projects list` (sesión del CLI) | Solo `migrantes-platform`, `ops-grow-development` (INACTIVE) y `kronaryx-ia`. El ref de PACTO no aparece |
| Organizaciones de la sesión | ANURYX, ops-grow-development, kronaryx-ia |
| Vercel (`dyann1984s-projects/pacto`) | Conserva `NEXT_PUBLIC_SUPABASE_URL`/`PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` y secretos PayPal/Anthropic, pero apuntan al proyecto que ya no responde |
| Causa | **No determinada.** Un proyecto pausado sigue apareciendo como INACTIVE (como `ops-grow-development`); este no aparece, así que fue eliminado o pertenece a otra cuenta/organización de Supabase |

## Respaldos (`C:\Users\DYANN\Documents\pacto-backups`, solo lectura)

`2026-10-12-pre-refunds` (13 archivos, JSON válido):
- Datos: profiles 292, pactos 93, agreements 93, acceptance_criteria 93, milestones 93, participants 128, acceptances 67, closure_confirmations 52, invitations 39, audit_events 581, ai_analyses 0, payments 0.
- `schema-public.json`: 269 objetos (26 funciones, 71 constraints, 26 índices, 27 políticas RLS, 84 columnas, 35 grants). Triggers: no hay clave propia; verificar si están dentro de `def` de funciones.
- Posteriores: `pre-refund-by-capture` (esquema + audit_events, milestones, payments) y `pre-ai-quota` (esquema, 274 objetos).

**No respaldado:** `auth.users` (cuentas, contraseñas, sesiones, identidades), pagos Sandbox posteriores al 12 oct. y cambios hechos después.

## Plan de reconstrucción (solo si el proyecto está eliminado; requiere autorización)

1. Confirmar en https://supabase.com/dashboard (todas las cuentas) que no existe. Si existe, restaurar o pedir acceso: no se pierde nada.
2. Crear un proyecto nuevo (región cercana; plan Free).
3. Aplicar las migraciones de `supabase/migrations` en orden (11 archivos: 202610020001 … 202610160001; el brief decía siete, el repo tiene once) con `supabase db query --linked -f`.
4. Habilitar Auth: sign-ins anónimos, confirmación de correo y URL de sitio/redirecciones de `pacto-pearl.vercel.app`; Google OAuth si se usa (`docs/google-oauth-setup.md`).
5. Reprovisionar cuentas demo con `scripts/provision-demo.mjs` y registrar `PACTO_DEMO_*` en `.env.local`.
6. Restaurar datos de negocio: viable solo para tablas sin dependencia de `auth.users`; `profiles` y todo con FK a usuarios requiere IDs nuevos. En la práctica, los 93 pactos antiguos no son recuperables con sus dueños; para el hackathon basta con el pacto demo de ejemplo (`202610100001_demo_example.sql`).
7. Actualizar en Vercel (Production): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; redeploy (autorización explícita).
8. Revisar que el webhook de PayPal sigue apuntando a la URL de Vercel (no cambia).
9. Ejecutar `check:integrations`, Vitest y los 26 E2E; actualizar `FINAL_CHECKLIST.md`.

## Qué necesito de ti

- Mirar el dashboard de Supabase en todas tus cuentas y decirme si existe (pausado / otra cuenta) o fue eliminado.
- Si fue eliminado: autorizar crear el proyecto nuevo y, después, el cambio de variables en Vercel y el redeploy.
- Si el proyecto está en otra cuenta: `npx supabase@2.120.0 login` con esa cuenta (yo abro el proceso, tú lo completas).
