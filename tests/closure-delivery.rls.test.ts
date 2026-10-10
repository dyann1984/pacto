import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

/**
 * El cierre exige entrega cumplida (202610130001_closure_requires_delivery.sql).
 *
 * Antes de esta migración un Pacto se podía cerrar con sus hitos en PENDING: el
 * recorrido terminaba en «Cerrado» mientras la sección de entregas seguía diciendo
 * «Pendiente de entrega», sin forma de corregirlo porque un Pacto cerrado no admite
 * cambios. Estas pruebas fijan la regla y comprueban que el recorrido legítimo
 * completo sigue llegando al cierre.
 */

const BUYER = "11111111-1111-4111-8111-111111111111",
  SELLER = "33333333-3333-4333-8333-333333333333",
  INTRUDER = "66666666-6666-4666-8666-666666666666";

const MIGRATIONS = [
  "supabase/migrations/202610020001_foundation.sql",
  "supabase/migrations/202610080001_closure_cancellation_ai.sql",
  "supabase/migrations/202610090001_roles_admin.sql",
  "supabase/migrations/202610100001_demo_example.sql",
  "supabase/migrations/202610110001_invitations.sql",
  "supabase/migrations/202610120001_milestones_payments.sql",
  "supabase/migrations/202610130001_closure_requires_delivery.sql",
];

let db: PGlite;

async function asUser(id: string, query: string, params: unknown[] = []) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
  return db.query(query, params);
}

async function scalar<T>(id: string, query: string, params: unknown[] = []) {
  const { rows } = await asUser(id, query, params);
  return rows[0] as T;
}

async function asService(query: string, params: unknown[] = []) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  return db.query(query, params);
}

/** Pacto con proveedor unido y acuerdo aceptado por ambas partes. */
async function acceptedPacto(title: string, totalCents: number) {
  const pacto = (
    await scalar<{ id: string }>(
      BUYER,
      "select public.create_pacto($1,'Rediseñar la tienda en línea según el plan acordado',$2) id",
      [title, totalCents],
    )
  ).id;
  const token = (await scalar<{ t: string }>(BUYER, "select public.create_invitation($1) t", [pacto])).t;
  await asUser(SELLER, "select public.accept_invitation($1)", [token]);
  const agreement = (
    await scalar<{ id: string }>(BUYER, "select id from public.agreements where pacto_id=$1", [pacto])
  ).id;
  const milestone = (
    await scalar<{ id: string }>(BUYER, "select id from public.milestones where agreement_id=$1", [agreement])
  ).id;
  await asUser(BUYER, "select public.submit_agreement($1)", [agreement]);
  await asUser(SELLER, "select public.accept_agreement($1)", [agreement]);
  await asUser(BUYER, "select public.accept_agreement($1)", [agreement]);
  return { pacto, agreement, milestone };
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key, email text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;",
  );
  await db.query(
    "insert into auth.users(id,email) values($1,'cliente@example.com'),($2,'proveedor@example.com'),($3,'intruso@example.com')",
    [BUYER, SELLER, INTRUDER],
  );
  for (const file of MIGRATIONS) await db.exec(await readFile(file, "utf8"));
}, 30000);

afterAll(async () => {
  await db.close();
});

describe.sequential("el cierre exige la entrega cumplida", () => {
  it("ninguna parte puede cerrar con el hito pendiente de entrega", async () => {
    const { pacto, milestone } = await acceptedPacto("Cierre sin entrega", 2500000);
    expect((await scalar<{ s: string }>(BUYER, "select status s from public.milestones where id=$1", [milestone])).s).toBe("PENDING");
    for (const party of [BUYER, SELLER])
      await expect(asUser(party, "select public.confirm_closure($1,'')", [pacto])).rejects.toThrow("DELIVERY_REQUIRED");
    // El intento rechazado no deja ninguna confirmación a medias.
    expect(
      (await scalar<{ n: number }>(BUYER, "select count(*)::int n from public.closure_confirmations where pacto_id=$1", [pacto])).n,
    ).toBe(0);
    expect((await scalar<{ s: string }>(BUYER, "select status s from public.pactos where id=$1", [pacto])).s).toBe("ACTIVE");
  });

  it("la evidencia sola no basta: falta la autorización del cliente", async () => {
    const { pacto, milestone } = await acceptedPacto("Cierre con evidencia sin autorizar", 2500000);
    await asUser(SELLER, "select public.submit_milestone_evidence($1,$2)", [
      milestone,
      "Tienda publicada y revisada con el cliente el 10 de octubre.",
    ]);
    await expect(asUser(BUYER, "select public.confirm_closure($1,'')", [pacto])).rejects.toThrow("DELIVERY_REQUIRED");
    await expect(asUser(SELLER, "select public.confirm_closure($1,'')", [pacto])).rejects.toThrow("DELIVERY_REQUIRED");
  });

  it("con el hito autorizado, ambas partes cierran el Pacto", async () => {
    const { pacto, milestone } = await acceptedPacto("Cierre completo", 2500000);
    await asUser(SELLER, "select public.submit_milestone_evidence($1,$2)", [
      milestone,
      "Entrega realizada según lo acordado el 10 de octubre.",
    ]);
    await asUser(BUYER, "select public.approve_milestone($1)", [milestone]);
    expect((await scalar<{ r: string }>(BUYER, "select public.confirm_closure($1,'Conforme') r", [pacto])).r).toBe("CONFIRMED");
    expect((await scalar<{ r: string }>(SELLER, "select public.confirm_closure($1,'') r", [pacto])).r).toBe("CLOSED");
    expect((await scalar<{ s: string }>(BUYER, "select status s from public.pactos where id=$1", [pacto])).s).toBe("CLOSED");
  });

  it("un hito ya pagado también permite cerrar", async () => {
    const { pacto, milestone } = await acceptedPacto("Cierre tras el pago", 100000);
    await asUser(SELLER, "select public.submit_milestone_evidence($1,$2)", [
      milestone,
      "Entrega realizada y aceptada por el cliente.",
    ]);
    await asUser(BUYER, "select public.approve_milestone($1)", [milestone]);
    await asUser(BUYER, "select public.record_payment_order($1,$2,$3)", [milestone, "ORDER-CIERRE", 100000]);
    await asService("select public.record_payment_result($1,$2,$3)", ["ORDER-CIERRE", "CAPTURED", "CAPTURE-CIERRE"]);
    expect((await scalar<{ s: string }>(BUYER, "select status s from public.milestones where id=$1", [milestone])).s).toBe("PAID");
    await asUser(BUYER, "select public.confirm_closure($1,'')", [pacto]);
    expect((await scalar<{ r: string }>(SELLER, "select public.confirm_closure($1,'') r", [pacto])).r).toBe("CLOSED");
  });

  it("la regla de entrega no relaja ninguna comprobación anterior", async () => {
    const { pacto, agreement, milestone } = await acceptedPacto("Precedencia de reglas", 2500000);
    // Un extraño sigue sin existir para el Pacto, antes de llegar a la regla de entrega.
    await expect(asUser(INTRUDER, "select public.confirm_closure($1,'')", [pacto])).rejects.toThrow("NOT_FOUND");
    // Una propuesta pendiente manda sobre la regla de entrega: primero hay que aceptarla.
    await asUser(BUYER, "select public.revise_agreement($1,$2,$3)", [
      agreement,
      "Alcance revisado tras la primera versión del acuerdo",
      2500000,
    ]);
    await expect(asUser(BUYER, "select public.confirm_closure($1,'')", [pacto])).rejects.toThrow("PENDING_PROPOSAL");
    expect(milestone).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("una revisión del acuerdo vuelve a exigir la entrega de la versión nueva", async () => {
    const { pacto, agreement, milestone } = await acceptedPacto("Revisión tras entregar", 2500000);
    await asUser(SELLER, "select public.submit_milestone_evidence($1,$2)", [
      milestone,
      "Primera entrega realizada según lo acordado.",
    ]);
    await asUser(BUYER, "select public.approve_milestone($1)", [milestone]);
    await asUser(BUYER, "select public.confirm_closure($1,'')", [pacto]);
    // Cambiar el alcance crea una versión nueva, con su propio hito sin entregar.
    const next = (
      await scalar<{ id: string }>(BUYER, "select public.revise_agreement($1,$2,$3) id", [
        agreement,
        "Alcance ampliado: también se migran los datos históricos",
        3000000,
      ])
    ).id;
    await asUser(BUYER, "select public.submit_agreement($1)", [next]);
    await asUser(SELLER, "select public.accept_agreement($1)", [next]);
    await asUser(BUYER, "select public.accept_agreement($1)", [next]);
    // Las confirmaciones anteriores se borraron y la entrega nueva está pendiente.
    await expect(asUser(BUYER, "select public.confirm_closure($1,'')", [pacto])).rejects.toThrow("DELIVERY_REQUIRED");
    expect((await scalar<{ s: string }>(BUYER, "select status s from public.pactos where id=$1", [pacto])).s).toBe("ACTIVE");
  });

  it("la migración no concede ningún permiso nuevo a los clientes", async () => {
    const { rows } = await db.query<{ table_name: string; privilege_type: string; grantee: string }>(
      "select table_name, privilege_type, grantee from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated')",
    );
    expect(rows.filter((r) => r.privilege_type !== "SELECT")).toEqual([]);
    expect(rows.some((r) => r.grantee === "anon")).toBe(false);
  });
});
