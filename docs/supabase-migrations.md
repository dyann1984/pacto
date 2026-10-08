# Procedimiento de migraciones Supabase

Aplica solo al proyecto Supabase dedicado a PACTO. No usar una base ajena ni una con tablas homónimas.

## Orden

1. `supabase/preflight.sql`: solo lectura. Cada fila indica si un objeto ya existe.
2. `supabase/migrations/202610020001_foundation.sql` solo si el preflight muestra la base limpia.
3. `supabase/migrations/202610080001_closure_cancellation_ai.sql` solo si el preflight muestra solo foundation.
4. `supabase/preflight.sql` de nuevo: todas las filas deben ser `true`.

## Reglas de seguridad

- Ejecutar cada archivo en el SQL Editor como propietario del proyecto, pegando el contenido completo.
- Ambas migraciones abren una transacción (`begin;`) y se detienen si ya fueron aplicadas (`MIGRATION_ALREADY_APPLIED`) o si falta un prerrequisito (`PREREQUISITE_MISSING`). Un error revierte todo el archivo.
- **Tras cualquier error, ejecutar `rollback;` antes de otra consulta.** PostgreSQL deja la sesión en transacción abortada hasta ese punto.
- No hay migraciones de reversa. Ante un fallo: `rollback;`, revisar el preflight y no borrar datos.
- No desactivar RLS ni cambiar la confirmación de correo para "hacer pasar" una comprobación.
- No usar la clave `service_role` en la aplicación ni en `NEXT_PUBLIC_*`.

## Verificación posterior

```bash
corepack pnpm@11.28.5 check:demo-users
```

Solo imprime estados y códigos de error. Requiere `.env.local` con las variables DEMO. Salida 0 significa ambos usuarios operativos con correo confirmado. Salida 2 significa credenciales inválidas; 3, correo sin confirmar.

## Verificación de compatibilidad (local)

`tests/migrations.test.ts` aplica ambas migraciones sobre PostgreSQL embebido y comprueba:

- el orden correcto (foundation → cierre/IA) y el preflight en cada estado;
- que un reintento de cualquiera de las dos aborta sin cambios parciales;
- que la migración de cierre no se ejecuta sin foundation;
- que `closure_confirmations` y `ai_analyses` no tienen privilegios de escritura para `anon` ni `authenticated`.

Estas pruebas no sustituyen la ejecución contra el proyecto remoto.
