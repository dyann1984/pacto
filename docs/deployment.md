# Despliegue en Vercel

> **Actualización del 12 de octubre de 2026.**
> - `production` = `98a821d`: reembolsos (`251c899`) y la guía de pagar antes de cerrar
>   (`625a234`). Verificado con HTTP y con el recorrido del Modo Juez en producción.
> - **Migración `202610140001_refunds.sql` aplicada** en la base real, con respaldo previo
>   (fuera del repositorio). Comprobado después: columnas `refund_id` y `refunded_at`, CHECK
>   con `REFUNDED`, `record_payment_refund` ejecutable solo por `service_role`, RLS en las 12
>   tablas, 27 políticas y datos intactos. Una segunda ejecución aborta con
>   `MIGRATION_ALREADY_APPLIED`.
> - **Variables de Vercel (Production):** las credenciales PayPal Sandbox se guardaron con
>   `scripts/set-paypal-sandbox.mjs`, que las valida contra PayPal (token, propiedad del
>   webhook `0BY007329M302654B`, URL y eventos) antes de escribirlas.
> - **Ojo:** `vercel env pull` no devuelve las variables *sensibles*: entrega un marcador
>   fijo de 11 caracteres, así que no sirve para comparar ni para probar sus valores.
>   Para validarlas, usar `.env.local` (mismos valores) o el comportamiento en producción.
> - Suscripciones del webhook completadas con `scripts/paypal-webhook-events.mjs --apply`:
>   faltaban `PAYMENT.CAPTURE.REFUNDED/REVERSED/DECLINED` (solo había los `PAYMENT.SALE.*`
>   de la API v1, que una orden v2 nunca emite).

**Estado al 10 de octubre de 2026.** El proyecto está desplegado y accesible en
https://pacto-pearl.vercel.app, vinculado al proyecto Vercel `pacto`
(`.vercel/project.json`).

## Estado del despliegue: al día

Actualizado el **10 de octubre de 2026**. La rama `production` apunta a
`9041273`, que ya incluye los hitos y pagos (`6dfdd18`), el Modo Juez
(`2c406ab`) y las correcciones posteriores.

Comprobado con peticiones reales contra `https://pacto-pearl.vercel.app`
después de desplegar:

| Ruta | Antes | Ahora |
|---|---|---|
| `/` | 200 | 200 |
| `/sign-in` | 200 | 200 |
| `/demo` | 200 | 200 |
| **`/juez`** | **404** | **200** |
| `/invitacion/<token>` | 200 | 200 |
| `/pactos/<id>/pago` | 404 | 307 → `/sign-in` (sin sesión) |
| `/pactos`, `/admin` | 307 | 307 → `/sign-in` (sin sesión) |

Y el recorrido completo del Modo Juez —crear, invitar, unirse, aceptar por
ambas partes, presentar evidencia, autorizar y cerrar, con las comprobaciones
de seguridad— ejecutado **contra producción** con Playwright: pasa.

## Procedimiento para actualizar producción

Vercel está conectado a GitHub y despliega solo al recibir un push en la rama
`production`. No hace falta ninguna CLI.

### Opción A — por rama (la que usa el proyecto)

```bash
git checkout production
git pull --ff-only origin production
git merge --no-ff feat/paypal-ai-demo
git push origin production
```

El despliegue tarda entre uno y dos minutos. Para confirmarlo sin abrir el
panel, basta con que una ruta nueva deje de dar 404.

### Opción B — Preview primero (más prudente para un cambio grande)

```bash
git push origin feat/paypal-ai-demo
```

Vercel genera una URL de Preview. Verifícala antes de promover:

```bash
PACTO_E2E_BASE_URL=https://<url-preview> pnpm exec playwright test
```

Si la suite pasa, promuévelo desde el panel de Vercel
(*Deployments → … → Promote to Production*) o ejecuta la opción A.

### Antes de cada push a producción

Verificar sobre el árbol ya fusionado, no sobre la rama de trabajo:

```bash
pnpm test && pnpm build && pnpm lint && pnpm check:secrets
```

## Lista de verificación previa

- [x] `pnpm build` compila con TypeScript estricto
- [x] `pnpm lint` sin errores
- [x] `pnpm test` — 152/152
- [x] `pnpm exec playwright test` — 26 pasan, 0 fallan, 10 omitidas (9 por falta de credenciales DEMO, 1 son las capturas bajo demanda)
- [x] `pnpm check:secrets` — ningún secreto en el cliente
- [x] Recorrido completo del Modo Juez ejecutado **contra producción**
- [ ] `pnpm check:integrations` — 4 credenciales pendientes (ver `credentials-setup.md`)

## Variables de entorno en Vercel

Se configuran en **Project → Settings → Environment Variables**. Las marcadas
como sensibles no se pueden volver a leer después de guardarlas.

| Variable | Ámbito | Sensible | Obligatoria | Sin ella |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview | No | **Sí** | La aplicación no arranca |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production, Preview | No | **Sí** | La aplicación no arranca |
| `ANTHROPIC_API_KEY` | Production | **Sí** | Para la IA | El panel dice «no activado» |
| `ANTHROPIC_MODEL` | Production | No | No | Por defecto `claude-sonnet-5-5` |
| `PAYPAL_CLIENT_ID` | Production | **Sí** | Para el pago | El pago dice «no activado» |
| `PAYPAL_CLIENT_SECRET` | Production | **Sí** | Para el pago | Ídem |
| `PAYPAL_WEBHOOK_ID` | Production | **Sí** | Para los webhooks | Los avisos se rechazan (falla cerrado) |
| `SUPABASE_SERVICE_ROLE_KEY` | Production | **Sí** | Solo para los webhooks | El webhook no puede escribir el resultado |
| `PACTO_DEMO_EXAMPLE_ID` | Production | No | No | No se muestra el Pacto de ejemplo público |

Las credenciales `PACTO_DEMO_*` **no** se configuran en Vercel: son solo para las
pruebas E2E locales.

> **Las variables nuevas no afectan a un despliegue que ya existe.** Después de
> añadirlas hay que volver a desplegar (*Deployments → … → Redeploy*).

Cómo obtener cada una: `docs/credentials-setup.md`.

## Configuración de Supabase para el dominio desplegado

En **Authentication → URL Configuration**:

- *Site URL*: `https://pacto-pearl.vercel.app`
- *Redirect URLs*: añadir `https://pacto-pearl.vercel.app/auth/callback` y, si se
  usan Previews, el patrón de dominios de Preview.

En **Authentication → Sign In / Providers**: *Anonymous sign-ins* debe estar
activado. Verificado el 10 de octubre de 2026: **está activado** (lo confirma
`pnpm check:integrations`). De él dependen «Explorar DEMO» y el Modo Juez.

### Recomendación antes de la evaluación: subir el cupo de sesiones anónimas

En **Authentication → Rate Limits**, el límite de accesos anónimos por hora y
por dirección IP viene en **30** por defecto. Es poco para un periodo de
evaluación:

- El Modo Juez consume **dos** sesiones por recorrido, y «Reiniciar
  demostración» otras dos cada vez.
- Varios jueces detrás de una misma red corporativa o VPN comparten la cuenta
  de la IP.
- Comprobado el 10 de octubre de 2026: la suite E2E completa (~19 sesiones) cabe
  una vez por hora, pero dos ejecuciones seguidas agotan el cupo.

Un juez que lo agote **no** ve una avería: ambas entradas explican que es un
límite temporal y qué hacer. Aun así, subirlo durante el periodo de evaluación
evita el tropiezo. Es un cambio de panel, sin coste y reversible.

## Principios

- Solo `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` pueden
  llegar al navegador.
- Ninguna clave `service_role` ni de proveedor lleva el prefijo `NEXT_PUBLIC_`.
- El build no necesita secretos para compilar: el CI usa valores de marcador y
  `pnpm check:secrets` valida el bundle compilado.

## Verificación posterior al despliegue

```bash
pnpm check:secrets
PACTO_E2E_BASE_URL=https://pacto-pearl.vercel.app pnpm exec playwright test
```

Y a mano, lo mínimo:

- `GET /juez` responde **200** (es lo que falla hoy).
- `GET /pactos` sin sesión redirige a `/sign-in`.
- `GET /api/pactos/{uuid}` sin sesión responde 401.
- El Modo Juez completa el recorrido hasta `Cerrado`.
