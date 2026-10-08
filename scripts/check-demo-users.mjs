// Diagnóstico de usuarios DEMO A y B. Solo lectura. No imprime contraseñas, tokens ni correos completos.
// Uso: pnpm check:demo-users   (lee .env.local mediante --env-file)
import { createClient } from "@supabase/supabase-js";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "PACTO_DEMO_A_EMAIL",
  "PACTO_DEMO_A_PASSWORD",
  "PACTO_DEMO_B_EMAIL",
  "PACTO_DEMO_B_PASSWORD",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  // Solo nombres de variables: nunca valores.
  console.log(`Variables ausentes: ${missing.join(", ")}`);
  process.exit(4);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// a***@dominio.com: suficiente para identificar la cuenta sin exponer el correo completo.
function maskEmail(email) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

const tables = [
  "pactos",
  "agreements",
  "closure_confirmations",
  "ai_analyses",
];

async function checkUser(label, email, password) {
  const client = createClient(url, key, { auth: { persistSession: false } });
  console.log(`\n[${label}] ${maskEmail(email)}`);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    // error.code es un identificador como "invalid_credentials" o "email_not_confirmed".
    console.log(`  inicio de sesión: FALLA (${error.code ?? "sin código"}, HTTP ${error.status ?? "?"})`);
    return { ok: false, code: error.code };
  }
  const confirmed = Boolean(data.user.email_confirmed_at);
  console.log(`  inicio de sesión: OK`);
  console.log(`  correo confirmado: ${confirmed ? "sí" : "no"}`);
  for (const table of tables) {
    const { error: tableError, count } = await client
      .from(table)
      .select("*", { count: "exact", head: true });
    if (tableError) {
      console.log(`  tabla ${table}: NO DISPONIBLE (${tableError.code ?? "error"})`);
    } else {
      console.log(`  tabla ${table}: disponible, filas visibles para el usuario = ${count ?? 0}`);
    }
  }
  await client.auth.signOut();
  return { ok: true, confirmed };
}

const a = await checkUser("A", process.env.PACTO_DEMO_A_EMAIL, process.env.PACTO_DEMO_A_PASSWORD);
const b = await checkUser("B", process.env.PACTO_DEMO_B_EMAIL, process.env.PACTO_DEMO_B_PASSWORD);

if (!a.ok || !b.ok) {
  console.log("\nResultado: al menos un usuario no puede iniciar sesión.");
  console.log("Acción: en Supabase (Authentication → Users) confirmar el correo y restablecer la contraseña del usuario para que coincida con .env.local. No compartir la contraseña.");
  process.exit(2);
}
if (!a.confirmed || !b.confirmed) {
  console.log("\nResultado: inicio de sesión correcto, pero falta confirmar el correo de al menos un usuario.");
  process.exit(3);
}
console.log("\nResultado: ambos usuarios DEMO pueden iniciar sesión y tienen correo confirmado.");
