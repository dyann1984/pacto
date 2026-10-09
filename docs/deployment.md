# Despliegue en Vercel (Preview primero)

Estado: configuración preparada y documentada. **Sin despliegue realizado.** Falta vincular el repositorio de GitHub y el proyecto Vercel, que requieren acción de la propietaria.

## Principios

- Preview y Production usan proyectos Supabase distintos. Preview usa el proyecto DEMO; Production no se crea hasta validar el MVP.
- Solo `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` pueden exponerse al navegador.
- `ANTHROPIC_API_KEY` y cualquier clave `service_role` se configuran como variables **Sensitive** de Vercel, solo en el ámbito necesario, nunca con prefijo `NEXT_PUBLIC_`.
- El build no necesita secretos para compilar: el CI usa valores de marcador y `pnpm check:secrets` valida el bundle compilado.

## Variables de entorno

| Variable | Ámbito | Sensible | Obligatoria | Notas |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Preview | No | Sí | URL del proyecto DEMO |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Preview | No | Sí | Clave pública del proyecto DEMO |
| `ANTHROPIC_API_KEY` | Preview | **Sí** | Para IA real | Sin ella, la pantalla muestra `NOT_CONFIGURED` |
| `ANTHROPIC_MODEL` | Preview | No | No | Por defecto `claude-sonnet-5-5` |

Las credenciales DEMO (`PACTO_DEMO_*`) **no** se configuran en Vercel. Son solo para pruebas E2E locales.

## Pasos (los ejecuta la propietaria)

1. Crear el repositorio en GitHub y subir la rama `contest/cierre-ia-mvp`:
   ```bash
   git remote add origin <URL-del-repositorio>
   git push -u origin contest/cierre-ia-mvp
   ```
2. En Vercel, importar el repositorio. Framework: Next.js. Install: `corepack pnpm@11.28.5 install --frozen-lockfile` (también declarado en `vercel.json`).
3. Añadir las variables de la tabla en el ámbito **Preview**.
4. Abrir el Preview de la rama, ejecutar el smoke de la sección siguiente y revisar los logs.
5. Solo después de validar el Preview, decidir si se promueve a Production.

## Smoke test de un Preview

- `GET /sign-in` responde 200.
- `GET /pactos` redirige a `/sign-in` sin sesión.
- `GET /api/pactos/{uuid}` responde 401 sin sesión.
- Ejecutar `PACTO_E2E_BASE_URL=<url-preview> corepack pnpm@11.28.5 test:e2e` con las credenciales DEMO en el entorno local.

## Verificación de exposición

```bash
corepack pnpm@11.28.5 build
corepack pnpm@11.28.5 check:secrets
```

Revisa archivos rastreados, variables leídas en componentes de cliente y el bundle de cliente compilado. No imprime valores.
