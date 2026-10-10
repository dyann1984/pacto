# Despliegue en Vercel

**Estado al 10 de octubre de 2026.** El proyecto está desplegado y accesible en
https://pacto-pearl.vercel.app, vinculado al proyecto Vercel `pacto`
(`.vercel/project.json`).

## ⚠️ El despliegue público está desactualizado

Comprobado con peticiones reales el 10 de octubre de 2026:

| Ruta | Producción | Local (`2c406ab`) |
|---|---|---|
| `/` | 200 | 200 |
| `/sign-in` | 200 | 200 |
| `/demo` | 200 | 200 |
| **`/juez`** | **404** | 200 |

La rama `production` apunta a `cbe8963` (merge de `dd94565`), **anterior** a:

- `6dfdd18` — hitos, evidencia de entrega y pagos con PayPal Sandbox autorizados por una persona.
- `2c406ab` — **Modo Juez**, la vía de evaluación que documentan `DEMO_GUIDE.md`,
  `en/JUDGE_INSTRUCTIONS.md` y el guion del vídeo.

**Consecuencia:** un juez que siga la guía de la entrega aterriza en una página
que no existe, y no puede ver ni los pagos ni el análisis de IA. Es el bloqueo
más grave para el concurso y se resuelve desplegando `feat/paypal-ai-demo`.

## Procedimiento para actualizar producción

Requiere intervención de la propietaria: en este equipo no están instalados
`gh`, `vercel` ni `supabase`, y publicar es una acción hacia fuera.

### Opción A — por rama (la que ya usa el proyecto)

```bash
git checkout production
git merge --no-ff feat/paypal-ai-demo -m "merge: publish milestones, PayPal Sandbox payments and Judge Mode"
git push origin production
```

Vercel construye y promueve automáticamente la rama de producción.

### Opción B — Preview primero (más prudente)

```bash
git push origin feat/paypal-ai-demo
```

Vercel genera una URL de Preview. Verifícala antes de promover:

```bash
PACTO_E2E_BASE_URL=https://<url-preview> pnpm exec playwright test
```

Si la suite pasa contra el Preview, promuévelo desde el panel de Vercel
(*Deployments → … → Promote to Production*) o ejecuta la opción A.

## Lista de verificación previa

- [x] `pnpm build` compila con TypeScript estricto
- [x] `pnpm lint` sin errores
- [x] `pnpm test` — 152/152
- [x] `pnpm exec playwright test` — 25 pasan, 0 fallan, 10 omitidas (9 por falta de credenciales DEMO, 1 son las capturas bajo demanda)
- [x] `pnpm check:secrets` — ningún secreto en el cliente
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
