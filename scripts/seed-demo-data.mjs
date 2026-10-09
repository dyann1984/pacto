// Crea datos de demostración reales en Supabase usando exclusivamente la clave
// pública y los RPC de la aplicación (el mismo camino que un usuario real):
// un Pacto que recorre todo el ciclo hasta CLOSED, y otro cancelado.
// No usa service_role. Seguro de ejecutar varias veces (crea Pactos nuevos cada vez).
//
// Uso: node --env-file=.env.local scripts/seed-demo-data.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const emailA = process.env.PACTO_DEMO_A_EMAIL;
const passA = process.env.PACTO_DEMO_A_PASSWORD;
const emailB = process.env.PACTO_DEMO_B_EMAIL;
const passB = process.env.PACTO_DEMO_B_PASSWORD;
const idB = process.env.PACTO_DEMO_B_ID;

for (const [name, v] of Object.entries({ url, key, emailA, passA, emailB, passB, idB })) {
  if (!v) {
    console.error(`Falta ${name} en el entorno. Ejecuta antes scripts/provision-demo-admin.mjs.`);
    process.exit(1);
  }
}

async function clientAs(email, password) {
  const c = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`No se pudo iniciar sesión como ${email}: ${error.message}`);
  return c;
}

const a = await clientAs(emailA, passA);
const b = await clientAs(emailB, passB);

console.log("--- Pacto 1: ciclo completo hasta CERRADO ---");
const { data: pacto1, error: e1 } = await a.rpc("create_pacto", {
  p_title: "Impermeabilización de cubierta — DEMO",
  p_scope: "Impermeabilizar 180 m2 de cubierta con membrana asfáltica y garantía de 5 años.",
  p_total_cents: 1740000,
});
if (e1) throw new Error(e1.message);
console.log("Pacto 1 creado:", pacto1);

let { error: eSeller } = await a.rpc("add_seller", { p_id: pacto1, p_user_id: idB });
if (eSeller) throw new Error(eSeller.message);

const { data: agreements1 } = await a.from("agreements").select("id").eq("pacto_id", pacto1);
const agreementId1 = agreements1[0].id;

let { error: eSubmit } = await a.rpc("submit_agreement", { a_id: agreementId1 });
if (eSubmit) throw new Error(eSubmit.message);
await b.rpc("accept_agreement", { a_id: agreementId1 });
await a.rpc("accept_agreement", { a_id: agreementId1 });
console.log("Pacto 1: acuerdo aceptado por ambas partes.");

await a.rpc("confirm_closure", { p_id: pacto1, p_note: "Entrega verificada en sitio." });
const { data: closeResult } = await b.rpc("confirm_closure", { p_id: pacto1, p_note: "Conforme con la entrega." });
console.log(`Pacto 1: ${closeResult}`);

console.log("\n--- Pacto 2: cancelado con motivo ---");
const { data: pacto2, error: e2 } = await a.rpc("create_pacto", {
  p_title: "Pintura de fachada — DEMO (cancelado)",
  p_scope: "Pintura exterior de fachada de 3 niveles con acabado elastomérico.",
  p_total_cents: 520000,
});
if (e2) throw new Error(e2.message);
await a.rpc("cancel_pacto", {
  p_id: pacto2,
  p_reason: "El comprador decidió posponer el proyecto para el próximo trimestre.",
});
console.log("Pacto 2 creado y cancelado:", pacto2);

console.log("\n=== DATOS DE DEMOSTRACIÓN LISTOS ===");
console.log(`Pacto cerrado:    ${pacto1}`);
console.log(`Pacto cancelado:  ${pacto2}`);
