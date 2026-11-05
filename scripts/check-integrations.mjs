/**
 * Comprobación de integraciones externas. Responde una sola pregunta: ¿están
 * vivas PayPal e IA en este entorno, aquí y ahora?
 *
 * No simula nada. Si falta una credencial lo dice; si está presente, hace una
 * llamada real al proveedor y reporta lo que contestó. Nunca imprime el valor de
 * una clave: solo si existe, su longitud y su prefijo reconocible.
 *
 *   node --env-file=.env.local scripts/check-integrations.mjs
 *
 * Salida 0 si todo lo configurado responde bien (aunque falten integraciones);
 * salida 1 si algo configurado está roto, que es el caso que importa detectar
 * antes de enseñarle PACTO a un juez.
 */

const PAYPAL_SANDBOX = "https://api-m.sandbox.paypal.com";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 20_000;

let broken = 0;
let missing = 0;

const ok = (m) => console.log(`  OK       ${m}`);
const fail = (m) => { broken++; console.log(`  ROTO     ${m}`); };
const absent = (m) => { missing++; console.log(`  FALTA    ${m}`); };
const info = (m) => console.log(`           ${m}`);

/**
 * Describe una variable sin revelarla. El prefijo solo se muestra en identificadores
 * públicos (clave publicable, Client ID); de un secreto, ni un carácter.
 */
const PUBLIC_PREFIX = new Set(["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "PAYPAL_CLIENT_ID", "PAYPAL_WEBHOOK_ID"]);
function shape(name) {
  const v = process.env[name];
  if (!v) return null;
  return PUBLIC_PREFIX.has(name) ? `${v.length} caracteres, empieza por "${v.slice(0, 4)}…"` : `${v.length} caracteres`;
}

function section(title) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 58 - title.length))}`);
}

// ─────────────────────────────────────────────────────────── Supabase
section("Supabase");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  fail("NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ausentes: la aplicación no arranca sin ellas.");
} else if (supabaseKey.startsWith("eyJ") && supabaseKey.includes("service_role")) {
  fail("La clave pública parece una service_role. NUNCA en una variable NEXT_PUBLIC_*.");
} else {
  ok(`URL y clave pública presentes (${shape("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")}).`);
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabaseKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      fail(`El proyecto Supabase respondió HTTP ${res.status} al consultar su configuración de autenticación.`);
    } else {
      const settings = await res.json();
      ok("El proyecto Supabase responde.");
      if (settings?.external?.anonymous_users === true) {
        ok("Accesos anónimos ACTIVADOS: la DEMO y el Modo Juez funcionan sin registro.");
      } else {
        fail("Accesos anónimos DESACTIVADOS: «Explorar DEMO» y el Modo Juez fallarán.");
        info("Actívalos en Supabase → Authentication → Sign In / Providers → Anonymous sign-ins.");
      }
    }
  } catch (e) {
    fail(`No se pudo contactar con el proyecto Supabase: ${e.name}`);
  }
}

if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  ok(`SUPABASE_SERVICE_ROLE_KEY presente (${shape("SUPABASE_SERVICE_ROLE_KEY")}). Solo para scripts locales y la conciliación por webhook.`);
} else {
  absent("SUPABASE_SERVICE_ROLE_KEY: sin ella no se pueden aprovisionar las cuentas DEMO (9 pruebas E2E quedan omitidas).");
  info("Supabase → Project Settings → API Keys → service_role. Va solo en .env.local, nunca en el repositorio.");
}

// ─────────────────────────────────────────────────────────── PayPal
section("PayPal (Sandbox)");

const payId = process.env.PAYPAL_CLIENT_ID;
const paySecret = process.env.PAYPAL_CLIENT_SECRET;

if (!payId || !paySecret) {
  absent("PAYPAL_CLIENT_ID y/o PAYPAL_CLIENT_SECRET: el pago mostrará «no activado» en la interfaz.");
  info("developer.paypal.com → Apps & Credentials → pestaña Sandbox → Create App.");
  info("Ver docs/credentials-setup.md para los pasos exactos, incluido el webhook.");
} else {
  info(`CLIENT_ID: ${shape("PAYPAL_CLIENT_ID")} · CLIENT_SECRET: ${shape("PAYPAL_CLIENT_SECRET")}`);
  try {
    const basic = Buffer.from(`${payId}:${paySecret}`).toString("base64");
    const res = await fetch(`${PAYPAL_SANDBOX}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${basic}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 401) {
      fail("PayPal Sandbox rechazó las credenciales (HTTP 401). Revisa que sean del entorno Sandbox y no de Live.");
    } else if (!res.ok) {
      fail(`PayPal Sandbox respondió HTTP ${res.status} al pedir el token.`);
    } else {
      const body = await res.json();
      if (!body.access_token) fail("PayPal devolvió 200 pero sin access_token.");
      else ok(`Token obtenido de PayPal Sandbox (caduca en ${body.expires_in}s). Las órdenes y capturas funcionarán.`);
    }
  } catch (e) {
    fail(`No se pudo contactar con PayPal Sandbox: ${e.name}`);
  }
}

if (process.env.PAYPAL_WEBHOOK_ID) {
  ok(`PAYPAL_WEBHOOK_ID presente (${shape("PAYPAL_WEBHOOK_ID")}).`);
} else {
  absent("PAYPAL_WEBHOOK_ID: los webhooks de PayPal se rechazarán (el código falla cerrado, a propósito).");
  info("Se crea en la misma app Sandbox, apuntando a https://<dominio>/api/paypal/webhook con los eventos PAYMENT.CAPTURE.*.");
}

// ─────────────────────────────────────────────────────────── Anthropic
section("Análisis con IA (Anthropic)");

const aiKey = process.env.ANTHROPIC_API_KEY;
const aiModel = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

if (!aiKey) {
  absent("ANTHROPIC_API_KEY: el panel de análisis mostrará «no activado» en lugar de hallazgos.");
  info("console.anthropic.com → API Keys → Create Key. Solo servidor: nunca con prefijo NEXT_PUBLIC_.");
} else if (aiKey.startsWith("NEXT_PUBLIC")) {
  fail("La clave de Anthropic no debe vivir en una variable NEXT_PUBLIC_*: llegaría al navegador.");
} else {
  info(`Clave: ${shape("ANTHROPIC_API_KEY")} · modelo: ${aiModel}`);
  try {
    // Petición mínima real: confirma clave, modelo y conectividad con el coste
    // más bajo posible. No se usa su contenido para nada.
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": aiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: aiModel,
        max_tokens: 4,
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 401) fail("Anthropic rechazó la clave (HTTP 401).");
    else if (res.status === 404) fail(`Anthropic no reconoce el modelo "${aiModel}" (HTTP 404). Revisa ANTHROPIC_MODEL.`);
    else if (res.status === 429) fail("Anthropic respondió 429: la clave es válida pero está limitada o sin crédito.");
    else if (!res.ok) fail(`Anthropic respondió HTTP ${res.status}.`);
    else ok(`El modelo "${aiModel}" respondió. El análisis de acuerdos funcionará.`);
  } catch (e) {
    fail(`No se pudo contactar con la API de Anthropic: ${e.name}`);
  }
}

// ─────────────────────────────────────────────────────────── Resumen
section("Resumen");

if (broken === 0 && missing === 0) {
  console.log("  Todo configurado y respondiendo. PACTO puede demostrarse completo.\n");
} else {
  if (missing) console.log(`  ${missing} integración(es) sin configurar: la interfaz lo dirá honestamente, sin simular nada.`);
  if (broken) console.log(`  ${broken} comprobación(es) ROTAS: algo está configurado pero no funciona. Corrígelo antes de demostrar.`);
  console.log("");
}

process.exit(broken === 0 ? 0 : 1);
