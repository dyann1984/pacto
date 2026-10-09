// Crea el Pacto de ejemplo público usando dos sesiones anónimas desechables
// (sin service_role, sin correo, sin contraseña) y lo recorre hasta CLOSED.
// Imprime el ID resultante; marcarlo is_demo_example=true se hace aparte por SQL.
//
// Uso: node --env-file=.env.local scripts/seed-demo-example.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en .env.local");
  process.exit(1);
}

async function anonymousClient(label) {
  const c = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInAnonymously();
  if (error) {
    console.error(`No se pudo crear la sesión anónima ${label}: ${error.message}`);
    console.error("¿Está habilitado 'Allow anonymous sign-ins' en Supabase?");
    process.exit(1);
  }
  console.log(`${label}: sesión anónima creada (${data.user.id.slice(0, 8)}…)`);
  return { client: c, id: data.user.id };
}

const buyer = await anonymousClient("Comprador");
const seller = await anonymousClient("Proveedor");

const { data: pactoId, error: e1 } = await buyer.client.rpc("create_pacto", {
  p_title: "Diseño de identidad de marca",
  p_scope:
    "Diseño de logotipo, paleta de color y manual de marca básico para una cafetería de especialidad, con dos rondas de revisión incluidas.",
  p_total_cents: 850000,
});
if (e1) throw new Error(e1.message);
console.log("Pacto de ejemplo creado:", pactoId);

const { error: e2 } = await buyer.client.rpc("add_seller", { p_id: pactoId, p_user_id: seller.id });
if (e2) throw new Error(e2.message);

const { data: agreements } = await buyer.client.from("agreements").select("id").eq("pacto_id", pactoId);
const agreementId = agreements[0].id;

const { error: e3 } = await buyer.client.rpc("submit_agreement", { a_id: agreementId });
if (e3) throw new Error(e3.message);

await seller.client.rpc("accept_agreement", { a_id: agreementId });
await buyer.client.rpc("accept_agreement", { a_id: agreementId });
console.log("Acuerdo aceptado por ambas partes.");

await buyer.client.rpc("confirm_closure", {
  p_id: pactoId,
  p_note: "Manual de marca entregado en PDF y archivos editables.",
});
const { data: finalState } = await seller.client.rpc("confirm_closure", {
  p_id: pactoId,
  p_note: "Conforme con los entregables.",
});
console.log(`Estado final: ${finalState}`);

console.log("\n=== EJEMPLO LISTO ===");
console.log(`ID del Pacto: ${pactoId}`);
console.log("Siguiente paso manual (por SQL, ya que ningún cliente puede hacerlo):");
console.log(`  update public.pactos set is_demo_example=true where id='${pactoId}';`);
