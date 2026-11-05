import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const BUYER = "11111111-1111-4111-8111-111111111111",
  SELLER = "33333333-3333-4333-8333-333333333333",
  INTRUDER = "66666666-6666-4666-8666-666666666666";

let db: PGlite;
let pacto: string, milestone: string;

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

/**
 * Escritura sin sesión de usuario: es lo que hacen el webhook firmado de PayPal y el
 * retorno del pagador, con el rol de servicio. auth.uid() devuelve null.
 */
async function asService(query: string, params: unknown[] = []) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  return db.query(query, params);
}

async function serviceScalar<T>(query: string, params: unknown[] = []) {
  const { rows } = await asService(query, params);
  return rows[0] as T;
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
  for (const file of [
    "supabase/migrations/202610020001_foundation.sql",
    "supabase/migrations/202610080001_closure_cancellation_ai.sql",
    "supabase/migrations/202610090001_roles_admin.sql",
    "supabase/migrations/202610100001_demo_example.sql",
    "supabase/migrations/202610110001_invitations.sql",
    "supabase/migrations/202610120001_milestones_payments.sql",
    "supabase/migrations/202610130001_closure_requires_delivery.sql",
  ]) {
    await db.exec(await readFile(file, "utf8"));
  }
  pacto = (
    await scalar<{ id: string }>(
      BUYER,
      "select public.create_pacto('Rediseño de tienda','Rediseñar la tienda en línea según el plan acordado',250000) id",
    )
  ).id;
  const token = (await scalar<{ t: string }>(BUYER, "select public.create_invitation($1) t", [pacto])).t;
  await asUser(SELLER, "select public.accept_invitation($1)", [token]);
  const agreement = (await scalar<{ id: string }>(BUYER, "select id from public.agreements where pacto_id=$1", [pacto])).id;
  milestone = (await scalar<{ id: string }>(BUYER, "select id from public.milestones where agreement_id=$1", [agreement])).id;
}, 30000);

afterAll(async () => {
  await db.close();
});

describe.sequential("milestones, evidence and PayPal sandbox payments", () => {
  it("nothing can be paid before both parties accepted the agreement", async () => {
    await expect(asUser(SELLER, "select public.submit_milestone_evidence($1,$2)", [milestone, "Entrega realizada según el plan"])).rejects.toThrow(
      "INVALID_STATE",
    );
    const agreement = (await scalar<{ id: string }>(BUYER, "select id from public.agreements where pacto_id=$1", [pacto])).id;
    await asUser(BUYER, "select public.submit_agreement($1)", [agreement]);
    await asUser(SELLER, "select public.accept_agreement($1)", [agreement]);
    await asUser(BUYER, "select public.accept_agreement($1)", [agreement]);
  });

  it("only the seller submits evidence; the buyer and strangers cannot", async () => {
    await expect(asUser(BUYER, "select public.submit_milestone_evidence($1,$2)", [milestone, "Intento del cliente"])).rejects.toThrow("NOT_FOUND");
    await expect(asUser(INTRUDER, "select public.submit_milestone_evidence($1,$2)", [milestone, "Intento de un extraño"])).rejects.toThrow("NOT_FOUND");
    await expect(asUser(SELLER, "select public.submit_milestone_evidence($1,$2)", [milestone, "corto"])).rejects.toThrow("INVALID_INPUT");
    await asUser(SELLER, "select public.submit_milestone_evidence($1,$2)", [milestone, "Tienda publicada y revisada con el cliente el 12 de octubre."]);
    expect((await scalar<{ status: string }>(SELLER, "select status from public.milestones where id=$1", [milestone])).status).toBe(
      "EVIDENCE_SUBMITTED",
    );
  });

  it("payment is impossible without the buyer's explicit approval", async () => {
    await expect(asUser(BUYER, "select public.record_payment_order($1,$2,$3)", [milestone, "ORDER-1", 250000])).rejects.toThrow(
      "APPROVAL_REQUIRED",
    );
  });

  it("only the buyer approves, and only after evidence exists", async () => {
    await expect(asUser(SELLER, "select public.approve_milestone($1)", [milestone])).rejects.toThrow("NOT_FOUND");
    await expect(asUser(INTRUDER, "select public.approve_milestone($1)", [milestone])).rejects.toThrow("NOT_FOUND");
    await asUser(BUYER, "select public.approve_milestone($1)", [milestone]);
    expect((await scalar<{ status: string }>(BUYER, "select status from public.milestones where id=$1", [milestone])).status).toBe("APPROVED");
  });

  it("the order amount must match the milestone exactly", async () => {
    await expect(asUser(BUYER, "select public.record_payment_order($1,$2,$3)", [milestone, "ORDER-BAD", 100])).rejects.toThrow("AMOUNT_MISMATCH");
  });

  it("the seller cannot create a payment order for their own milestone", async () => {
    await expect(asUser(SELLER, "select public.record_payment_order($1,$2,$3)", [milestone, "ORDER-SELLER", 250000])).rejects.toThrow("NOT_FOUND");
  });

  it("creates one order and refuses a duplicate while it is open", async () => {
    await asUser(BUYER, "select public.record_payment_order($1,$2,$3)", [milestone, "ORDER-1", 250000]);
    await expect(asUser(BUYER, "select public.record_payment_order($1,$2,$3)", [milestone, "ORDER-2", 250000])).rejects.toThrow(
      "PAYMENT_ALREADY_OPEN",
    );
  });

  it("only the party that created the order can abandon it", async () => {
    // Para el proveedor y para un extraño la orden del cliente no existe: ni la cancelan
    // ni la marcan fallida, aunque conozcan el order_id (lo ven en el tablero).
    for (const outsider of [SELLER, INTRUDER])
      for (const status of ["CANCELLED", "FAILED"])
        await expect(asUser(outsider, "select public.record_payment_result($1,$2)", ["ORDER-1", status])).rejects.toThrow("NOT_FOUND");
    expect((await scalar<{ status: string }>(BUYER, "select status from public.payments where order_id=$1", ["ORDER-1"])).status).toBe("CREATED");
  });

  it("a cancelled order frees the milestone for a new attempt", async () => {
    expect((await scalar<{ r: string }>(BUYER, "select public.record_payment_result($1,$2) r", ["ORDER-1", "CANCELLED"])).r).toBe("CANCELLED");
    await asUser(BUYER, "select public.record_payment_order($1,$2,$3)", [milestone, "ORDER-3", 250000]);
    expect(
      (await scalar<{ n: number }>(BUYER, "select count(*)::int n from public.payments where milestone_id=$1", [milestone])).n,
    ).toBe(2);
  });

  // Una captura es un hecho externo: solo la afirma el servidor tras verificarla en
  // PayPal. Antes, cualquier participante con sesión podía declararla y marcar el hito
  // como pagado sin que PayPal hubiera cobrado nada.
  it("nobody can declare a capture from a user session, not even the payer", async () => {
    await expect(asUser(SELLER, "select public.record_payment_result($1,$2,$3)", ["ORDER-3", "CAPTURED", "CAPTURE-FALSA"])).rejects.toThrow(
      "NOT_FOUND",
    );
    await expect(asUser(BUYER, "select public.record_payment_result($1,$2,$3)", ["ORDER-3", "CAPTURED", "CAPTURE-FALSA"])).rejects.toThrow(
      "CAPTURE_NOT_ALLOWED",
    );
    // El intento no deja rastro de pago: el hito sigue sin pagar.
    expect((await scalar<{ status: string }>(BUYER, "select status from public.milestones where id=$1", [milestone])).status).toBe("APPROVED");
    expect((await scalar<{ status: string }>(BUYER, "select status from public.payments where order_id=$1", ["ORDER-3"])).status).toBe("CREATED");
  });

  it("the server (service role, no session) records the capture, and it is idempotent", async () => {
    expect((await serviceScalar<{ r: string }>("select public.record_payment_result($1,$2,$3) r", ["ORDER-3", "CAPTURED", "CAPTURE-3"])).r).toBe(
      "CAPTURED",
    );
    expect((await scalar<{ status: string }>(BUYER, "select status from public.milestones where id=$1", [milestone])).status).toBe("PAID");
    // El actor auditado es quien creó la orden, no un usuario nulo.
    expect(
      (await scalar<{ actor_id: string }>(BUYER, "select actor_id from public.audit_events where pacto_id=$1 and event_type='PAYMENT_CAPTURED'", [pacto]))
        .actor_id,
    ).toBe(BUYER);
    // Repetir la captura (webhook duplicado) no paga dos veces ni añade auditoría.
    const before = (await scalar<{ n: number }>(BUYER, "select count(*)::int n from public.audit_events where pacto_id=$1", [pacto])).n;
    expect((await serviceScalar<{ r: string }>("select public.record_payment_result($1,$2,$3) r", ["ORDER-3", "CAPTURED", "CAPTURE-3"])).r).toBe(
      "ALREADY_CAPTURED",
    );
    expect((await scalar<{ n: number }>(BUYER, "select count(*)::int n from public.audit_events where pacto_id=$1", [pacto])).n).toBe(before);
    // Y tampoco se puede revertir a FAILED después de capturado.
    expect((await serviceScalar<{ r: string }>("select public.record_payment_result($1,$2) r", ["ORDER-3", "FAILED"])).r).toBe("ALREADY_CAPTURED");
  });

  it("a paid milestone accepts no further evidence or approval", async () => {
    await expect(asUser(SELLER, "select public.submit_milestone_evidence($1,$2)", [milestone, "Intento posterior al pago"])).rejects.toThrow(
      "INVALID_TRANSITION",
    );
    await expect(asUser(BUYER, "select public.approve_milestone($1)", [milestone])).rejects.toThrow("EVIDENCE_REQUIRED");
  });

  it("a stranger can neither read payments nor touch an unknown order", async () => {
    expect((await asUser(INTRUDER, "select id from public.payments where pacto_id=$1", [pacto])).rows).toHaveLength(0);
    await expect(asUser(INTRUDER, "select public.record_payment_result($1,$2)", ["ORDER-3", "FAILED"])).rejects.toThrow("NOT_FOUND");
    expect((await asUser(INTRUDER, "select * from public.milestone_board($1)", [pacto])).rows).toHaveLength(0);
  });

  it("clients have no write grant on payments or milestones", async () => {
    await expect(asUser(BUYER, "update public.payments set status='CAPTURED' where order_id=$1", ["ORDER-3"])).rejects.toThrow("permission denied");
    await expect(asUser(BUYER, "update public.milestones set status='PAID' where id=$1", [milestone])).rejects.toThrow("permission denied");
    await expect(asUser(SELLER, "insert into public.payments(pacto_id,agreement_id,milestone_id,provider,order_id,amount_cents,created_by) values($1,$1,$1,'PAYPAL','X',1,$2)", [pacto, SELLER])).rejects.toThrow(
      "permission denied",
    );
  });

  it("participants see the board with the payment attached", async () => {
    const { rows } = await asUser(BUYER, "select status, payment_status, capture_id from public.milestone_board($1)", [pacto]);
    expect(rows).toEqual([{ status: "PAID", payment_status: "CAPTURED", capture_id: "CAPTURE-3" }]);
  });

  it("anonymous (unauthenticated) role cannot call any payment RPC", async () => {
    await db.exec("reset role; set role anon");
    await expect(db.query("select public.record_payment_result($1,$2)", ["ORDER-3", "FAILED"])).rejects.toThrow("permission denied");
    await db.exec("reset role");
  });
});
