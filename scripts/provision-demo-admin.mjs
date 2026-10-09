// Aprovisiona dos cuentas DEMO usando el mecanismo administrativo oficial de
// Supabase (Admin API, auth.admin.createUser con email_confirm:true). Evita por
// completo el envío de correo de confirmación: las cuentas quedan listas al
// instante, sin depender del límite de 2 correos/hora del proyecto.
//
// Requiere SUPABASE_SERVICE_ROLE_KEY en .env.local (nunca en el repositorio, nunca
// impreso aquí). Esta clave NO se usa en ningún archivo de src/: es exclusiva de
// este script de aprovisionamiento local.
//
// Uso: node --env-file=.env.local scripts/provision-demo-admin.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { randomBytes } from "crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  console.error("La service_role key se obtiene en Supabase → Project Settings → API → service_role.");
  process.exit(1);
}
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!publishableKey) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const suffix = randomBytes(4).toString("hex");

function randomPassword() {
  // Password aleatoria, nunca derivada de nada predecible, nunca impresa.
  return `Pj${randomBytes(12).toString("base64url")}!1`;
}

async function createDemoUser(label) {
  const email = `pacto-demo-${label.toLowerCase()}-${suffix}@test.pacto.dev`;
  const password = randomPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // confirmación automática oficial: sin correo, sin límite de envío
  });
  if (error) {
    console.error(`Alta de ${label} FALLÓ: ${error.message} (${error.code ?? error.status})`);
    process.exit(1);
  }
  console.log(`${label}: cuenta creada y confirmada (id ${data.user.id.slice(0, 8)}…)`);
  return { email, password, id: data.user.id };
}

const a = await createDemoUser("A");
const b = await createDemoUser("B");

// Verificación real de inicio de sesión con el cliente público (nunca con service_role).
const anon = createClient(url, publishableKey, { auth: { persistSession: false } });
for (const [label, u] of [["A", a], ["B", b]]) {
  const { error } = await anon.auth.signInWithPassword({ email: u.email, password: u.password });
  if (error) {
    console.error(`Verificación de inicio de sesión de ${label} FALLÓ: ${error.message}`);
    process.exit(1);
  }
  await anon.auth.signOut();
  console.log(`${label}: inicio de sesión verificado.`);
}

const envPath = ".env.local";
let env = readFileSync(envPath, "utf8");
const set = (key, value) => {
  const line = `${key}=${value}`;
  env = new RegExp(`^${key}=.*$`, "m").test(env) ? env.replace(new RegExp(`^${key}=.*$`, "m"), line) : env + `\n${line}`;
};
set("PACTO_DEMO_A_EMAIL", a.email);
set("PACTO_DEMO_A_PASSWORD", a.password);
set("PACTO_DEMO_B_EMAIL", b.email);
set("PACTO_DEMO_B_PASSWORD", b.password);
set("PACTO_DEMO_B_ID", b.id);
writeFileSync(envPath, env, "utf8");

console.log("\n.env.local actualizado con las dos cuentas DEMO.");
console.log("Las contraseñas NUNCA se imprimen aquí: ábralas usted misma en .env.local si necesita entregarlas a los jueces.");
console.log(`Correos (no sensibles): A=${a.email}  B=${b.email}`);
