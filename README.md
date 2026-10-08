# PACTO

**AI Commerce. Real Results.**

Convierte tus acuerdos en resultados reales: un Pacto reúne a comprador y proveedor, define alcance e importe, registra cada versión y cada decisión, y permite cerrarlo o cancelarlo con evidencia auditable. Un asistente de IA revisa el texto del acuerdo y señala ambigüedades, obligaciones, fechas, riesgos e inconsistencias, sin decidir por las partes.

## Alcance actual

Fase 3 autorizada para el concurso. Incluye:

- Autenticación con Supabase Auth y sesiones SSR (sin bypass local). Registro con correo y contraseña o con Google, confirmación de correo, recuperación de contraseña y cierre de sesión.
- Roles `user`/`admin`: todo registro nuevo recibe `user` por un trigger de base de datos; `admin` solo se asigna mediante una migración controlada que verifica identidad, nunca desde el formulario de registro ni desde la interfaz.
- `/admin`: panel de solo lectura (usuarios, Pactos y su estado, actividad y auditoría), exclusivo para administradores; RLS lo exige también a nivel de base de datos, no solo en la pantalla.
- Pactos con participantes BUYER/SELLER, acuerdos versionados, revisión y aceptación por ambas partes.
- **Cierre**: requiere un acuerdo ACCEPTED y ninguna propuesta pendiente; cada parte confirma con nota opcional, y el Pacto pasa a CLOSED cuando confirman ambas.
- **Cancelación**: cualquier participante de un Pacto ACTIVE puede cancelarlo con motivo de 10 a 500 caracteres. Es definitiva.
- **Historial**: `audit_events` registra cada acción con actor y, cuando aplica, su detalle (nota de cierre, motivo de cancelación, modelo de IA).
- **Análisis de IA** (`src/lib/ai.ts`): llama a la API de Anthropic con la clave del servidor, valida la salida con un esquema estricto y registra el resultado con modelo, huella SHA-256 de la entrada y autor. Sin clave configurada, informa `NOT_CONFIGURED` y no muestra resultados simulados.

Todos los Pactos son DEMO. No hay pagos, PayPal, Sandbox ni LIVE. La IA no modifica acuerdos ni estados. Google OAuth está en el código pero deshabilitado en Supabase hasta configurar credenciales (`docs/google-oauth-setup.md`).

## Requisitos

- Node.js 22 o superior.
- pnpm 11.28.5. Si `pnpm` no está en el PATH, usar `corepack pnpm@11.28.5`.
- Un proyecto Supabase dedicado a PACTO con dos usuarios DEMO confirmados.
- Opcional para análisis real: una clave de API de Anthropic.

## Configuración

```powershell
Copy-Item .env.example .env.local
# Completar .env.local en la máquina local. Nunca subir ese archivo.
```

| Variable | Obligatoria | Uso |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sí | Clave pública (no service_role) |
| `ANTHROPIC_API_KEY` | Para IA real | Solo servidor; sin prefijo `NEXT_PUBLIC_` |
| `ANTHROPIC_MODEL` | No | Por defecto `claude-sonnet-5-5` |

## Base de datos

Aplicar en orden, desde el SQL Editor como propietario del proyecto dedicado:

1. `supabase/migrations/202610020001_foundation.sql` (Fase 1)
2. `supabase/migrations/202610080001_closure_cancellation_ai.sql` (cierre, cancelación, IA)
3. `supabase/migrations/202610090001_roles_admin.sql` (registro, roles, panel admin)
4. `supabase/migrations/202610090002_assign_owner_admin.sql` (asigna `admin` a una única cuenta verificada; editar el UUID y correo antes de usarla en otro proyecto)

Usar `supabase/preflight.sql` antes de cada una para saber cuál aplicar. Las migraciones no son idempotentes: ejecutar cada una una sola vez. RLS está activo en todas las tablas; los clientes no tienen INSERT/UPDATE/DELETE y todas las escrituras pasan por RPC que usan `auth.uid()`.

## Ejecutar

```powershell
corepack pnpm@11.28.5 install --frozen-lockfile
corepack pnpm@11.28.5 dev
```

Abrir http://127.0.0.1:3000.

## Comprobaciones

```powershell
corepack pnpm@11.28.5 lint
corepack pnpm@11.28.5 typecheck
corepack pnpm@11.28.5 test
corepack pnpm@11.28.5 build
```

`pnpm test` ejecuta:

- `tests/domain.test.ts`: invariantes del dominio.
- `tests/authorization.test.ts` y `tests/api-idor.test.ts`: autorización y acceso HTTP entre usuarios.
- `tests/rls.test.ts`: RLS y RPC de la Fase 1 sobre PostgreSQL embebido (PGlite).
- `tests/closure-ai.rls.test.ts`: cierre con doble confirmación, bloqueo de cambios tras cierre o cancelación, motivo obligatorio, auditoría, RLS de confirmaciones y evidencia de IA.
- `tests/agreement-analysis.test.ts`: prompt, validación de salida y llamada al proveedor con `fetch` simulado (sin red).

Las pruebas de PGlite validan el SQL real, pero **no sustituyen** la verificación contra el Supabase remoto.

## Integración con Supabase remoto (pendiente de verificación)

Estado al cierre de esta entrega: el inicio de sesión DEMO fallaba con `invalid_credentials`. La configuración pública de Auth muestra signups habilitados y confirmación de correo activa. Mientras los usuarios DEMO no estén confirmados y con la contraseña de `.env.local`, la autenticación real no funciona. Ver `docs/architecture.md` (matriz de comprobación) y el guion de demostración.

## Estructura

- `src/domain`: entidades, invariantes y análisis de IA (prompt y esquema de salida), sin dependencias de UI.
- `src/application`: lectura autorizada del Pacto.
- `src/lib`: cliente Supabase SSR, sesión validada y proveedor de IA (solo servidor).
- `src/app`: pantallas, Server Actions y endpoint de lectura.
- `src/proxy.ts`: renovación de cookies; no es el control de autorización.
- `supabase/migrations`: esquema, RLS, RPC transaccionales y auditoría.
- `tests`: dominio, autorización, IDOR HTTP, RLS en PostgreSQL, IA.
- `.github/workflows/ci.yml`: lint, typecheck, pruebas y build en cada push y pull request.

## Límites conocidos

- Un solo hito y criterio por versión; el editor multi-hito queda para una fase posterior.
- El proveedor se incorpora por UUID de una identidad Auth ya provisionada; no hay invitaciones.
- La cancelación es unilateral (decisión de producto documentada); el cierre requiere ambas partes.
- Los análisis de IA se registran tal como los envía la aplicación. Un participante autenticado con acceso directo a la RPC `record_ai_analysis` podría registrar un resultado manual; la huella y el modelo permiten detectarlo en la auditoría, pero no lo impiden.
- No hay certificación de firma electrónica ni asesoría jurídica.
- No hay despliegue público todavía; ver `docs/architecture.md`.
