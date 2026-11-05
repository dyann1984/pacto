// Revisa (y con --apply completa) las suscripciones del webhook de PayPal SANDBOX de PACTO.
//
//   node --env-file=.env.local scripts/paypal-webhook-events.mjs           # solo lectura
//   node --env-file=.env.local scripts/paypal-webhook-events.mjs --apply   # añade los que falten
//
// Usa las credenciales de .env.local, así que PayPal solo responde si el webhook pertenece
// a esa misma aplicación. No crea webhooks nuevos ni quita suscripciones existentes, y
// solo añade eventos que PayPal tenga en su catálogo. No imprime credenciales.
const SANDBOX = "https://api-m.sandbox.paypal.com";
const EXPECTED_URL = "https://pacto-pearl.vercel.app/api/paypal/webhook";
// Eventos que procesa src/app/api/paypal/webhook/route.ts.
const HANDLED = [
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.DENIED",
  "PAYMENT.CAPTURE.DECLINED",
  "PAYMENT.CAPTURE.REFUNDED",
  "PAYMENT.CAPTURE.REVERSED",
];
const apply = process.argv.includes("--apply");

const { PAYPAL_CLIENT_ID: id, PAYPAL_CLIENT_SECRET: secret, PAYPAL_WEBHOOK_ID: webhookId } = process.env;
if (!id || !secret || !webhookId) {
  console.error("Faltan PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET o PAYPAL_WEBHOOK_ID en .env.local.");
  process.exit(1);
}

async function call(path, init = {}) {
  const res = await fetch(`${SANDBOX}${path}`, { ...init, signal: AbortSignal.timeout(20_000) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

const token = await call("/v1/oauth2/token", {
  method: "POST",
  headers: {
    authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    "content-type": "application/x-www-form-urlencoded",
  },
  body: "grant_type=client_credentials",
});
if (!token.ok) {
  console.error(`PayPal Sandbox rechazó las credenciales (HTTP ${token.status}).`);
  process.exit(1);
}
const auth = { authorization: `Bearer ${token.body.access_token}`, "content-type": "application/json" };

const hook = await call(`/v1/notifications/webhooks/${webhookId}`, { headers: auth });
if (hook.status === 404) {
  console.error("El webhook NO pertenece a la aplicación de estas credenciales (404).");
  process.exit(1);
}
if (!hook.ok) {
  console.error(`No se pudo leer el webhook (HTTP ${hook.status}).`);
  process.exit(1);
}
console.log(`Pertenece a esta aplicación Sandbox: sí`);
console.log(`URL: ${hook.body.url} ${hook.body.url === EXPECTED_URL ? "(correcta)" : "(DISTINTA de la esperada)"}`);
const current = (hook.body.event_types ?? []).map((e) => e.name);
console.log(`Suscritos ahora: ${current.join(", ")}`);
if (current.includes("*")) {
  console.log("Suscrito a todos los eventos: no falta ninguno.");
  process.exit(0);
}

const catalog = await call("/v1/notifications/webhooks-event-types", { headers: auth });
const available = new Set((catalog.body.event_types ?? []).map((e) => e.name));
const missing = HANDLED.filter((e) => !current.includes(e));
const addable = missing.filter((e) => available.has(e));
const unknown = missing.filter((e) => !available.has(e));
if (unknown.length) console.log(`No existen en el catálogo de PayPal (no se pueden suscribir): ${unknown.join(", ")}`);
if (!addable.length) {
  console.log("No falta ninguna suscripción disponible.");
  process.exit(0);
}
console.log(`Faltan: ${addable.join(", ")}`);
if (!apply) {
  console.log("Ejecuta con --apply para añadirlas.");
  process.exit(0);
}

// Se reemplaza la lista por la actual MÁS las que faltan: nada se quita.
const patch = await call(`/v1/notifications/webhooks/${webhookId}`, {
  method: "PATCH",
  headers: auth,
  body: JSON.stringify([
    { op: "replace", path: "/event_types", value: [...current, ...addable].map((name) => ({ name })) },
  ]),
});
if (!patch.ok) {
  console.error(`PayPal rechazó la actualización (HTTP ${patch.status}${patch.body?.name ? ", " + patch.body.name : ""}).`);
  process.exit(1);
}
const after = (patch.body.event_types ?? []).map((e) => e.name);
console.log(`Actualizado. Suscritos ahora: ${after.join(", ")}`);
