# PACTO — PHASE 1 FOUNDATION REPORT

Fecha: 2 de octubre de 2026. Raíz: `L:\PACTO`.

**Estado: implementación local verificada; PHASE 1 NO terminada por falta de conexión Supabase y comprobación con identidades Auth reales de prueba.** No se inició PHASE 2.

## Implementación

Next.js App Router 16.3.8, React 19.3.0, TypeScript estricto, Supabase SSR/Auth, Zod y monolito modular. `src/domain` no depende de UI; `src/application` verifica pertenencia; Server Actions autentican y validan argumentos; PostgreSQL vuelve a comprobar membresía mediante RPC y RLS. Proxy renueva sesión; no es el control de autorización.

Landing, sign-in, lista de Pactos, creación básica y Command Center están implementados. Azul marino, dorado, blanco y neutros; controles responsive y foco visible. Logo vectorial propio derivado de la dirección aprobada, no una P tipográfica ni icono de catálogo. Capturas inspeccionadas de landing y sign-in desktop/mobile.

## Esquema y políticas

Entidades: User/Auth + profiles, Pacto, Participant, Agreement, Milestone, AcceptanceCriterion, Acceptance, AuditEvent. Importes en centavos MXN. Roles BUYER/SELLER por Pacto, máximo una identidad por rol, sin rol global.

RLS SELECT por membresía en Pacto; entidades hijas heredan aislamiento. Profiles solo propio. Clientes no tienen escrituras directas. RPC limitadas generan eventos dentro de la transacción con actor `auth.uid()` y timestamps de servidor. EXECUTE revocado a PUBLIC/anon. No hay service_role en la aplicación.

DRAFT → REVIEW → ACCEPTED. Una propuesta posterior deja vigente la versión aceptada; solo después de dos aceptaciones la anterior pasa a SUPERSEDED. Editar el borrador elimina aceptaciones obsoletas. Pruebas verifican estas transiciones.

## Autenticación

Implementados sign-in mediante password Supabase, sign-out, cookies SSR y verificación `auth.getUser()`. Sin `.env.local` ni variables Supabase disponibles, el formulario queda deshabilitado, rutas protegidas redirigen al acceso y API devuelve 503 CONFIGURATION_REQUIRED. No existe autenticación simulada ni usuarios reales inventados.

**Pendiente:** aplicar migración en una instancia dedicada, provisionar usuarios DEMO y verificar login/logout/refresh, creación persistida e aislamiento con PostgREST real. PGlite usa identidades sintéticas exclusivas de tests y no verifica el proveedor remoto de identidad.

## Resultados ejecutados

| Comando real                                                                                                     | Resultado                                                                  |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `node node_modules/eslint/bin/eslint.js .`                                                                       | Exit 0, sin errores                                                        |
| `node node_modules/typescript/bin/tsc --noEmit`                                                                  | Exit 0                                                                     |
| `node node_modules/vitest/vitest.mjs run --reporter=default --reporter=json --outputFile=docs/test-results.json` | Exit 0; 23/23 tests, 4 archivos                                            |
| `node node_modules/vitest/vitest.mjs run tests/authorization.test.ts tests/api-idor.test.ts`                     | Exit 0; 9/9 tests                                                          |
| `node node_modules/vitest/vitest.mjs run tests/rls.test.ts`                                                      | Exit 0; suite RLS ejecutada; luego ampliada a 10 tests, incluidos en 23/23 |
| `node node_modules/next/dist/bin/next build --webpack`                                                           | Exit 0; producción compilada, rutas protegidas dinámicas                   |
| `node node_modules/next/dist/bin/next start --hostname 127.0.0.1`                                                | Ready, servidor local iniciado                                             |
| `node scripts/browser-check.mjs`                                                                                 | Exit 0; desktop 1440×1000 y mobile 390×844                                 |

Reporte detallado: `docs/test-results.json`, `docs/browser-results.json`.

Pruebas: 4 dominio; 4 autorización; 5 HTTP IDOR con proveedor de identidad mock; 10 PostgreSQL RLS/RPC ejecutando la migración real mediante PGlite. Se crean Pactos A/B en la base de prueba, se deniega lectura y modificación ajenas, se bloquea falsificación de audit trail y se verifica aceptación/versionado. Estos registros no se presentan como datos comerciales ni como persistencia Supabase conectada.

Browser: landing HTTP 200, navegación al acceso funcional, rutas protegidas redirigen, cero desbordamiento horizontal, cero errores de consola. API sin configuración falla cerrada con 503. No hay screenshots de Command Center autenticado: requieren una sesión auténtica.

## Archivos creados

- Configuración: package.json, pnpm-lock.yaml, pnpm-workspace.yaml, tsconfig.json, next.config.ts, next-env.d.ts, eslint.config.mjs, vitest.config.ts, .env.example, .gitignore, .gitattributes, .npmrc, .prettierignore.
- Dominio/servidor: src/domain/foundation.ts, src/application/pactos.ts, src/lib/session.ts, src/lib/supabase.ts, src/proxy.ts.
- UI: src/app/layout.tsx, src/app/globals.css, src/app/page.tsx, src/app/not-found.tsx, src/components/brand.tsx, public/pacto-mark.svg.
- Acceso: src/app/sign-in/page.tsx y actions.ts.
- Pactos: src/app/pactos/layout.tsx, page.tsx, actions.ts, error.tsx, new/page.tsx, [id]/page.tsx.
- Endpoint: src/app/api/pactos/[id]/route.ts.
- Datos: supabase/migrations/202610020001_foundation.sql.
- Tests: tests/domain.test.ts, authorization.test.ts, api-idor.test.ts, rls.test.ts.
- Verificación visual: scripts/browser-check.mjs; docs/screenshots/landing-desktop.png, landing-mobile.png, sign-in-desktop.png, sign-in-mobile.png.
- Documentación: README.md, docs/architecture.md, este informe y reportes JSON.

## Deuda y riesgos

1. Configuración Supabase ausente: impide verificar los criterios conectados de autenticación, persistencia y aislamiento entre sesiones.
2. Incorporación de proveedor por UUID provisionado. No hay invitaciones, descubrimiento o verificación de proveedor.
3. Editor básico de un hito; no es generación IA ni Change Orders.
4. Hardening adicional de CSP, cuotas, retención y recuperación pendiente. No se declara seguro ni production-ready.
5. Windows bloquea módulos nativos SWC/Rollup y ejecutables esbuild/agent-browser. Build usa fallback SWC WASM; tests usan overrides WASM; screenshots usan Chrome headless vía Playwright. No se modificó la política de Windows.
6. No existe storage operativo, PayPal, IA o métricas ficticias. Esas capacidades aparecen solo como Próxima fase.

## Git

Repositorio local inicializado en la raíz oficial, rama main. Commit de Foundation preparado con código, migración, tests y evidencia. El hash y estado final se reportan en chat después de crear el commit. Sin remote ni publicación. `.env.local`, dependencias, cachés y builds excluidos.

## Definition of Done

Cumplidos localmente: inicio, identidad visual, modelo/roles, versionado, auditoría y aislamiento SQL en tests, IDOR, lint, tipos, tests y build. **No cumplidos todavía en la aplicación conectada:** autenticación funcional comprobada, dos usuarios aislados mediante sesiones reales y al menos un Pacto persistido en Supabase. Por ello no se declara PHASE 1 terminada.

Para completar: seguir configuración Supabase en README y ejecutar la matriz conectada de docs/architecture.md. Continuar exclusivamente Foundation. PHASE 2 requiere autorización posterior.
