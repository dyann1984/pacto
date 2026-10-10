# Credenciales: cómo obtenerlas y dónde ponerlas

Las cuatro credenciales pendientes **no requieren tocar el código**. PACTO ya
está integrado con los tres servicios; sin las claves, cada pantalla dice
honestamente que la función no está activada en lugar de simular un resultado.

Para comprobar en cualquier momento cuáles están vivas:

```bash
node --env-file=.env.local scripts/check-integrations.mjs
```

Hace llamadas reales a cada proveedor y reporta lo que contestaron. Nunca imprime
el valor de una clave.

## Regla de oro

- **Nunca** con prefijo `NEXT_PUBLIC_`: eso las enviaría al navegador.
- **Nunca** en el repositorio. `.env.local` está en `.gitignore`.
- **Nunca** pegadas en un chat, un issue o una captura de pantalla.
- En Vercel se marcan como **Sensitive**, para que no se puedan volver a leer.
- `pnpm check:secrets` revisa el bundle compilado y los archivos rastreados.

---

## 1. `ANTHROPIC_API_KEY` — análisis del acuerdo con IA

Es la que más peso tiene para el concurso: el criterio *Technological
Implementation* evalúa precisamente el uso de la IA.

1. Entra en https://console.anthropic.com con la cuenta de la propietaria.
2. **Settings → API Keys → Create Key**. Ponle un nombre reconocible, por ejemplo
   `pacto-produccion`.
3. Cópiala en cuanto aparezca: la consola no vuelve a mostrarla.
4. Añade saldo en **Billing** si la cuenta es nueva; sin saldo la clave es válida
   pero devuelve `429`.

Dónde ponerla:

```ini
# .env.local  (solo en tu equipo)
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-5-5
```

En Vercel: **Project → Settings → Environment Variables**, ámbito *Production*
(y *Preview* si quieres probarla antes), marcada como **Sensitive**.

**Coste.** Cada análisis manda el texto del acuerdo y recibe un JSON estructurado.
Con `claude-sonnet-5-5` ronda los 2 centavos de dólar por análisis; cambiando
`ANTHROPIC_MODEL` a `claude-haiku-5-5` baja a unos 2 dólares por cada mil. Para
una demostración de concurso el gasto es de céntimos. El código limita la
respuesta a 16 000 tokens y aborta a los 90 segundos.

---

## 2. PayPal Sandbox — `PAYPAL_CLIENT_ID` y `PAYPAL_CLIENT_SECRET`

El código fuerza el host de Sandbox (`api-m.sandbox.paypal.com`) y **no puede**
generar un cobro real, aunque se configure lo contrario.

1. Entra en https://developer.paypal.com y accede con tu cuenta de PayPal.
2. **Apps & Credentials** → asegúrate de estar en la pestaña **Sandbox**, no en
   *Live*. Es el error más común: unas credenciales Live dan `401` aquí.
3. **Create App** → tipo *Merchant* → nombre, por ejemplo `PACTO`.
4. En la ficha de la app aparecen **Client ID** y **Secret** (hay que pulsar
   *Show* para el secreto).

```ini
# .env.local
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
```

### Cuentas de prueba para pagar

PayPal crea automáticamente dos cuentas ficticias en **Testing Tools → Sandbox
Accounts**: una *Business* (la que cobra) y una *Personal* (la que paga). La
Personal es la que se usa para aprobar el pago durante la demostración; su
contraseña se consulta ahí mismo con **View/Edit account**. Son cuentas
ficticias con dinero ficticio.

> Para que el pago en pesos funcione, la cuenta Business debe aceptar **MXN**.
> Si PayPal rechaza la orden por divisa, cámbiala en la propia cuenta Sandbox o
> ajusta la divisa del proyecto.

### El webhook — `PAYPAL_WEBHOOK_ID`

Sin este valor PACTO **rechaza** todos los webhooks. Es deliberado: un aviso que
no se puede verificar no debe cambiar el estado de un pago.

1. En la misma app Sandbox, baja hasta **Webhooks → Add Webhook**.
2. URL: `https://<tu-dominio>/api/paypal/webhook`
   (con el despliegue actual: `https://pacto-pearl.vercel.app/api/paypal/webhook`).
3. Eventos: marca al menos
   `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED` y `PAYMENT.CAPTURE.REFUNDED`.
4. Guarda. PayPal muestra entonces un **Webhook ID**; ese es el valor.

```ini
PAYPAL_WEBHOOK_ID=...
```

El webhook necesita además `SUPABASE_SERVICE_ROLE_KEY` en el servidor para poder
escribir el resultado del pago sin una sesión de usuario.

---

## 3. `SUPABASE_SERVICE_ROLE_KEY`

**Comprobado el 10 de octubre de 2026: no está configurada** — ni en
`.env.local`, ni como variable de entorno del usuario o de la máquina.

Da acceso total a la base de datos saltándose RLS. Trátala como una contraseña
maestra.

1. Supabase → tu proyecto → **Project Settings → API Keys**.
2. Copia la clave **`service_role`** (la etiquetada *secret*), no la
   `publishable`.

```ini
# .env.local  — nunca en el repositorio, nunca en el navegador
SUPABASE_SERVICE_ROLE_KEY=...
```

En Vercel solo hace falta si se activan los webhooks de PayPal, y siempre como
variable **Sensitive**.

Para qué sirve en PACTO:

- `scripts/provision-demo-admin.mjs`: crea las dos cuentas DEMO ya confirmadas,
  sin depender del envío de correo. Desbloquea las **9 pruebas E2E** de
  `tests/e2e/flows.spec.ts` que hoy se omiten.
- `src/app/api/paypal/webhook/route.ts`: escribe el resultado del pago cuando el
  aviso llega de PayPal y no hay ninguna sesión de usuario en juego.

---

## Después de configurarlas

```bash
node --env-file=.env.local scripts/check-integrations.mjs   # llamadas reales
pnpm check:secrets                                          # nada filtrado al cliente
pnpm build && pnpm exec playwright test                     # recorrido completo
```

Y en el despliegue, tras añadirlas en Vercel, hay que **volver a desplegar**: las
variables de entorno se leen en tiempo de construcción y de ejecución, no se
aplican a un despliegue que ya existe.
