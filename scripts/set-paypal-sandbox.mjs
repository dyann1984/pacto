// Configura las credenciales de PayPal SANDBOX de forma segura, verificándolas antes.
//
//   node scripts/set-paypal-sandbox.mjs [WEBHOOK_ID]
//
// - Pide PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET con entrada oculta: no van en argumentos
//   (visibles en la lista de procesos), ni se imprimen, ni se escriben en ningún registro.
// - Comprueba contra PayPal Sandbox, antes de guardar nada, que:
//     1. las credenciales son de Sandbox (obtienen un token en api-m.sandbox.paypal.com);
//     2. el webhook pertenece a ESA misma aplicación (PayPal solo lo devuelve a su dueña);
//     3. apunta a la URL de producción de PACTO, y qué eventos tiene suscritos.
// - Si todo es correcto, escribe las tres variables en .env.local y, si lo confirmas, en
//   Vercel Production como variables sensibles (el valor viaja por stdin a la CLI).
// - NO toca SUPABASE_SERVICE_ROLE_KEY en Vercel: esa clave es la que activa el botón de
//   pago, y se añade solo después de verificar la integración completa.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import readline from "node:readline";

const SANDBOX = "https://api-m.sandbox.paypal.com";
const WEBHOOK_ID = (process.argv[2] ?? "0BY007329M302654B").trim();
const EXPECTED_URL = "https://pacto-pearl.vercel.app/api/paypal/webhook";
// Eventos que el código de PACTO procesa (src/app/api/paypal/webhook/route.ts).
const HANDLED = [
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.DENIED",
  "PAYMENT.CAPTURE.DECLINED",
  "PAYMENT.CAPTURE.REFUNDED",
  "PAYMENT.CAPTURE.REVERSED",
];
const ENV_PATH = ".env.local";

if (!/^[A-Z0-9]{10,40}$/.test(WEBHOOK_ID)) {
  console.error("El identificador de webhook no tiene un formato válido.");
  process.exit(1);
}

// Una sola interfaz para todas las preguntas: con varias, la primera se queda con todo lo
// pendiente de la entrada. `muted` silencia el eco de lo que se teclea o pega.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let muted = false;
const write = rl._writeToOutput.bind(rl);
rl._writeToOutput = (s) => {
  if (!muted) write(s);
};
const lines = rl[Symbol.asyncIterator]();

async function ask(question, { hidden = false } = {}) {
  process.stdout.write(question);
  muted = hidden;
  const { value, done } = await lines.next();
  muted = false;
  if (hidden) process.stdout.write("\n");
  return done ? "" : String(value).trim();
}

const fail = (msg) => {
  console.error(`\nNO SE GUARDÓ NADA. ${msg}`);
  process.exit(1);
};

console.log("Configuración de PayPal SANDBOX para PACTO (nada de lo que pegues se mostrará).\n");
const clientId = await ask("PAYPAL_CLIENT_ID (Sandbox): ", { hidden: true });
const secret = await ask("PAYPAL_CLIENT_SECRET (Sandbox): ", { hidden: true });
if (clientId.length < 20 || secret.length < 20)
  fail("Los valores parecen incompletos (un Client ID o Secret real tiene unos 80 caracteres).");

// 1. Credenciales de Sandbox.
const tokenRes = await fetch(`${SANDBOX}/v1/oauth2/token`, {
  method: "POST",
  headers: {
    authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
    "content-type": "application/x-www-form-urlencoded",
  },
  body: "grant_type=client_credentials",
  signal: AbortSignal.timeout(20_000),
});
if (tokenRes.status === 401)
  fail("PayPal Sandbox rechazó las credenciales (401). Copia las de la pestaña Sandbox, no las de Live.");
if (!tokenRes.ok) fail(`PayPal Sandbox respondió HTTP ${tokenRes.status} al pedir el token.`);
const { access_token: token } = await tokenRes.json();
if (!token) fail("PayPal no devolvió un token.");
console.log("1. Credenciales válidas en PayPal SANDBOX.");

// 2. El webhook pertenece a esta misma aplicación.
const whRes = await fetch(`${SANDBOX}/v1/notifications/webhooks/${WEBHOOK_ID}`, {
  headers: { authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(20_000),
});
if (whRes.status === 404)
  fail(`El webhook ${WEBHOOK_ID} no pertenece a la aplicación de estas credenciales (PayPal responde 404).`);
if (!whRes.ok) fail(`PayPal respondió HTTP ${whRes.status} al consultar el webhook.`);
const webhook = await whRes.json();
console.log(`2. El webhook ${WEBHOOK_ID} pertenece a esta aplicación Sandbox.`);

// 3. URL y eventos.
if (webhook.url !== EXPECTED_URL) fail(`El webhook apunta a ${webhook.url}, no a ${EXPECTED_URL}.`);
console.log(`3. URL correcta: ${webhook.url}`);
const subscribed = (webhook.event_types ?? []).map((e) => e.name);
const all = subscribed.includes("*");
console.log(`   Eventos suscritos: ${subscribed.join(", ") || "(ninguno)"}`);
const missing = all ? [] : HANDLED.filter((e) => !subscribed.includes(e));
const ignored = all ? [] : subscribed.filter((e) => !HANDLED.includes(e));
if (missing.length) console.log(`   Procesados por PACTO pero NO suscritos: ${missing.join(", ")}`);
if (ignored.length) console.log(`   Suscritos que PACTO reconoce sin cambiar nada: ${ignored.join(", ")}`);
if (!all && !subscribed.includes("PAYMENT.CAPTURE.COMPLETED"))
  fail("Falta PAYMENT.CAPTURE.COMPLETED: sin él no se concilia un pago cuyo retorno se pierde.");

// 4. .env.local
const values = { PAYPAL_CLIENT_ID: clientId, PAYPAL_CLIENT_SECRET: secret, PAYPAL_WEBHOOK_ID: WEBHOOK_ID };
let env = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
if (env.charCodeAt(0) === 0xfeff) env = env.slice(1); // sin BOM: node --env-file no lo tolera
for (const [key, value] of Object.entries(values)) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  env = re.test(env) ? env.replace(re, () => line) : `${env.replace(/\n?$/, "\n")}${line}\n`;
}
writeFileSync(ENV_PATH, env, "utf8");
console.log("4. .env.local actualizado (PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID).");

// 5. Vercel Production
const answer = await ask("\n¿Actualizar también Vercel Production con estos tres valores? (s/N): ");
rl.close();
if (!/^s(i|í)?$/i.test(answer)) {
  console.log("Vercel no se modificó.");
  process.exit(0);
}
for (const [key, value] of Object.entries(values)) {
  // El valor va por stdin, nunca como argumento.
  const r = spawnSync("npx", ["--yes", "vercel@latest", "env", "add", key, "production", "--force", "--sensitive"], {
    input: value,
    shell: process.platform === "win32",
    stdio: ["pipe", "ignore", "pipe"],
    encoding: "utf8",
  });
  if (r.status !== 0) {
    const reason = (r.stderr ?? "").split("\n").find((l) => /error/i.test(l)) ?? `código ${r.status}`;
    console.error(`5. Vercel: no se pudo guardar ${key} (${reason.trim()}).`);
    process.exit(1);
  }
  console.log(`5. Vercel Production: ${key} guardada como sensible.`);
}
console.log("\nListo. Avisa a Claude para verificar la integración antes de activar el botón de pago.");
