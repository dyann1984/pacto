# PACTO

**AI Commerce. Real Results.**

Convierte tus acuerdos en resultados reales.

PHASE 1 Foundation. Código fuente exclusivamente en `L:\PACTO`.

## Estado honesto

UI, dominio, migración y pruebas implementados. IA, evidencia, PayPal y cambios de alcance están fuera de esta fase. Todos los Pactos creados son DEMO; no hay operaciones Sandbox ni LIVE. No existe un bypass local de autenticación. Sin configuración Supabase, el acceso queda deshabilitado.

## Requisitos

- Node.js 22 o superior; pnpm 11.
- Instancia Supabase dedicada a PACTO y dos usuarios Auth para la comprobación conectada.
- Credenciales públicas: URL y publishable key. No necesita service_role en la aplicación.

## Inicio

```powershell
Set-Location L:\PACTO
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
# Completar .env.local sin compartir secretos por chat.
pnpm dev --webpack
```

Abre http://127.0.0.1:3000. `--webpack` evita depender de Turbopack nativo en equipos que bloquean SWC; Next puede utilizar su fallback WASM. pnpm incluye overrides WASM de Rollup y esbuild para pruebas en Windows.

## Supabase

1. Aplicar `supabase/migrations/202610020001_foundation.sql` desde SQL Editor como propietario. No aplicarla a una base ajena o con tablas homónimas.
2. Crear dos usuarios de prueba en Auth y confirmar sus correos. Identificarlos explícitamente como DEMO en sus nombres. No usar identidades de terceros.
3. Configurar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en `.env.local`.
4. Reiniciar la aplicación. Iniciar sesión como comprador; crear Pacto; añadir el UUID Auth del proveedor.
5. Enviar a revisión. Aceptar con cada usuario desde sesiones independientes. Ambos deben aparecer registrados con sus IDs auténticos.
6. Crear un segundo Pacto con otra combinación de participantes y ejecutar la matriz de aislamiento de `docs/architecture.md`.

Sin instancias/credenciales, las pruebas locales validan PostgreSQL mediante PGlite y mockean el proveedor de identidad en pruebas HTTP. No equivalen a verificar Supabase Auth remoto ni PostgREST desplegado.

## Comprobaciones

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:authorization
pnpm test:rls
pnpm build
pnpm start
```

Las pruebas RLS ejecutan la migración real en PostgreSQL embebido, con roles `anon`/`authenticated` y `auth.uid()` de prueba. Nunca crean usuarios de producción. Cubren acceso a datos, RPC, auditoría y aceptación/versionado.

## Estructura

- `src/domain`: entidades, schemas e invariantes independientes de UI.
- `src/application`: lectura autorizada del Pacto.
- `src/lib`: cliente Supabase SSR y sesión validada.
- `src/app`: pantallas, Server Actions y endpoint de lectura.
- `src/proxy.ts`: renovación de cookies; no constituye el control de autorización.
- `supabase/migrations`: esquema, RLS y operaciones transaccionales.
- `tests`: dominio, autorización, HTTP IDOR y PostgreSQL RLS.
- `public/pacto-mark.svg`: marca vectorial propia inspirada en la referencia aprobada.

No hay SDK de IA ni PayPal, claves correspondientes, metrics fake, storage público o módulos simulados. No avanzar a PHASE 2 sin autorización.
