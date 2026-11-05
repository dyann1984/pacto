import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

/**
 * Reembolsos de PayPal Sandbox (202610140001_refunds.sql).
 *
 * Mismo principio que la captura: un reembolso es un hecho externo. PACTO no lo declara,
 * lo registra cuando PayPal lo confirma por webhook firmado. Ninguna sesión de cliente
 * puede marcar un pago como reembolsado.
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
  "supabase/migrations/202610140001_refunds.sql",
  "supabase/migrations/202610150001_refund_by_capture.sql",
];

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

/** Servidor sin sesión: el webhook firmado, con el rol de servicio. */
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
    "create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key, email text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to authenticated,anon,service_role; grant execute on function auth.uid() to authenticated,anon,service_role;",
  );
  await db.query(
    "insert into auth.users(id,email) values($1,'cliente@example.com'),($2,'proveedor@example.com'),($3,'intruso@example.com')",
    [BUYER, SELLER, INTRUDER],
  );
  for (const file of MIGRATIONS) await db.exec(await readFile(file, "utf8"));

  // Escenario: acuerdo aceptado, entrega presentada y autorizada, pago capturado.
  pacto = (
    await scalar<{ id: string }>(
      BUYER,
      "select public.create_pacto('Reembolso de prueba','Alcance de prueba para verificar el tratamiento de reembolsos',100000) id",
    )
  ).id;
  const token = (await scalar<{ t: string }>(BUYER, "select public.create_invitation($1) t", [pacto])).t;
  await asUser(SELLER, "select public.accept_invitation($1)", [token]);
  const agreement = (await scalar<{ id: string }>(BUYER, "select id from public.agreements where pacto_id=$1", [pacto])).id;
  milestone = (await scalar<{ id: string }>(BUYER, "select id from public.milestones where agreement_id=$1", [agreement])).id;
  await asUser(BUYER, "select public.submit_agreement($1)", [agreement]);
  await asUser(SELLER, "select public.accept_agreement($1)", [agreement]);
  await asUser(BUYER, "select public.accept_agreement($1)", [agreement]);
  await asUser(SELLER, "select public.submit_milestone_evidence($1,$2)", [milestone, "Entrega realizada según lo acordado."]);
  await asUser(BUYER, "select public.approve_milestone($1)", [milestone]);
  await asUser(BUYER, "select public.record_payment_order($1,$2,$3)", [milestone, "ORDER-R1", 100000]);
  await asService("select public.record_payment_result($1,$2,$3)", ["ORDER-R1", "CAPTURED", "CAPTURE-R1"]);
}, 30000);

afterAll(async () => {
  await db.close();
});

describe.sequential("reembolsos confirmados por PayPal", () => {
  it("ninguna sesión de cliente puede declarar un reembolso", async () => {
    for (const who of [BUYER, SELLER, INTRUDER])
      await expect(asUser(who, "select public.record_payment_refund($1,$2)", ["ORDER-R1", "REFUND-FALSO"])).rejects.toThrow(
        /REFUND_NOT_ALLOWED|permission denied/,
      );
    // El intento no cambia nada: el hito sigue pagado.
    expect((await scalar<{ s: string }>(BUYER, "select status s from public.milestones where id=$1", [milestone])).s).toBe("PAID");
    expect((await scalar<{ s: string }>(BUYER, "select status s from public.payments where order_id=$1", ["ORDER-R1"])).s).toBe("CAPTURED");
  });

  it("el rol anon ni siquiera puede ejecutar la función", async () => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    await db.exec("set role anon");
    await expect(db.query("select public.record_payment_refund($1,$2)", ["ORDER-R1", "X"])).rejects.toThrow("permission denied");
    await db.exec("reset role");
  });

  it("el servidor registra el reembolso y el hito deja de constar como pagado", async () => {
    expect((await serviceScalar<{ r: string }>("select public.record_payment_refund($1,$2) r", ["ORDER-R1", "REFUND-R1"])).r).toBe("REFUNDED");
    const m = await scalar<{ status: string; paid_at: string | null }>(
      BUYER,
      "select status, paid_at from public.milestones where id=$1",
      [milestone],
    );
    // La entrega no se deshace: sigue entregada y autorizada.
    expect(m.status).toBe("APPROVED");
    expect(m.paid_at).toBeNull();
    const p = await scalar<{ status: string; refund_id: string; refunded_at: string | null }>(
      BUYER,
      "select status, refund_id, refunded_at from public.payments where order_id=$1",
      ["ORDER-R1"],
    );
    expect(p.status).toBe("REFUNDED");
    expect(p.refund_id).toBe("REFUND-R1");
    expect(p.refunded_at).not.toBeNull();
  });

  it("queda auditado, con el actor que creó la orden", async () => {
    const e = await scalar<{ actor_id: string; detail: string }>(
      BUYER,
      "select actor_id, detail from public.audit_events where pacto_id=$1 and event_type='PAYMENT_REFUNDED'",
      [pacto],
    );
    expect(e.actor_id).toBe(BUYER);
    expect(e.detail).toBe("REFUND-R1");
  });

  it("es idempotente ante un aviso duplicado", async () => {
    const before = (await scalar<{ n: number }>(BUYER, "select count(*)::int n from public.audit_events where pacto_id=$1", [pacto])).n;
    expect((await serviceScalar<{ r: string }>("select public.record_payment_refund($1,$2) r", ["ORDER-R1", "REFUND-R1"])).r).toBe(
      "ALREADY_REFUNDED",
    );
    expect((await scalar<{ n: number }>(BUYER, "select count(*)::int n from public.audit_events where pacto_id=$1", [pacto])).n).toBe(before);
  });

  it("el tablero muestra el reembolso en vez de ocultarlo", async () => {
    const { rows } = await asUser(BUYER, "select status, payment_status from public.milestone_board($1)", [pacto]);
    expect(rows).toEqual([{ status: "APPROVED", payment_status: "REFUNDED" }]);
  });

  it("tras el reembolso se puede volver a pagar, y el tablero muestra el intento nuevo", async () => {
    await asUser(BUYER, "select public.record_payment_order($1,$2,$3)", [milestone, "ORDER-R2", 100000]);
    const { rows } = await asUser(BUYER, "select payment_status, order_id from public.milestone_board($1)", [pacto]);
    // Una sola fila por hito, con el intento más reciente.
    expect(rows).toEqual([{ payment_status: "CREATED", order_id: "ORDER-R2" }]);
  });

  it("solo se reembolsa lo que se llegó a cobrar", async () => {
    await expect(asService("select public.record_payment_refund($1,$2)", ["ORDER-R2", "REFUND-X"])).rejects.toThrow("INVALID_TRANSITION");
    await expect(asService("select public.record_payment_refund($1,$2)", ["ORDER-INEXISTENTE", "REFUND-X"])).rejects.toThrow("NOT_FOUND");
  });

  it("un Pacto con un pago reembolsado se sigue pudiendo cerrar: cerrar nunca dependió del pago", async () => {
    await asService("select public.record_payment_result($1,$2)", ["ORDER-R2", "CANCELLED"]);
    expect((await scalar<{ r: string }>(BUYER, "select public.confirm_closure($1,'') r", [pacto])).r).toBe("CONFIRMED");
    expect((await scalar<{ r: string }>(SELLER, "select public.confirm_closure($1,'') r", [pacto])).r).toBe("CLOSED");
  });

  // Lo que se vio en producción: el rol de servicio NO puede leer `payments`, así que la
  // traducción captura -> orden tiene que hacerla la base. Aquí se ejecuta con el rol real
  // service_role, no como superusuario.
  describe("reembolso identificado por la captura (202610150001)", () => {
    async function asServiceRole(query: string, params: unknown[] = []) {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub','',false)");
      await db.exec("set role service_role");
      try {
        return await db.query(query, params);
      } finally {
        await db.exec("reset role");
      }
    }

    it("service_role no lee payments, pero sí registra el reembolso por captura", async () => {
      // Pago nuevo, capturado, sobre otro Pacto (el anterior ya está cerrado).
      const p2 = (
        await scalar<{ id: string }>(BUYER, "select public.create_pacto('Reembolso por captura','Alcance para el reembolso identificado por captura',50000) id")
      ).id;
      const token = (await scalar<{ t: string }>(BUYER, "select public.create_invitation($1) t", [p2])).t;
      await asUser(SELLER, "select public.accept_invitation($1)", [token]);
      const a2 = (await scalar<{ id: string }>(BUYER, "select id from public.agreements where pacto_id=$1", [p2])).id;
      const m2 = (await scalar<{ id: string }>(BUYER, "select id from public.milestones where agreement_id=$1", [a2])).id;
      await asUser(BUYER, "select public.submit_agreement($1)", [a2]);
      await asUser(SELLER, "select public.accept_agreement($1)", [a2]);
      await asUser(BUYER, "select public.accept_agreement($1)", [a2]);
      await asUser(SELLER, "select public.submit_milestone_evidence($1,$2)", [m2, "Entrega del segundo escenario."]);
      await asUser(BUYER, "select public.approve_milestone($1)", [m2]);
      await asUser(BUYER, "select public.record_payment_order($1,$2,$3)", [m2, "ORDER-C1", 50000]);
      await asService("select public.record_payment_result($1,$2,$3)", ["ORDER-C1", "CAPTURED", "CAPTURE-C1"]);

      // Sin GRANT manual: el permiso de ejecución lo concede la propia migración.
      await expect(asServiceRole("select order_id from public.payments where capture_id='CAPTURE-C1'")).rejects.toThrow("permission denied");
      const r = await asServiceRole("select public.record_payment_refund_by_capture($1,$2) r", ["CAPTURE-C1", "REFUND-C1"]);
      expect((r.rows[0] as { r: string }).r).toBe("REFUNDED");

      const p = await scalar<{ status: string; refund_id: string }>(BUYER, "select status, refund_id from public.payments where order_id='ORDER-C1'");
      expect(p).toEqual({ status: "REFUNDED", refund_id: "REFUND-C1" });
      expect((await scalar<{ s: string }>(BUYER, "select status s from public.milestones where id=$1", [m2])).s).toBe("APPROVED");
      expect(
        (await scalar<{ n: number }>(BUYER, "select count(*)::int n from public.audit_events where pacto_id=$1 and event_type='PAYMENT_REFUNDED'", [p2])).n,
      ).toBe(1);
      // Idempotente ante el aviso repetido.
      const again = await asServiceRole("select public.record_payment_refund_by_capture($1,$2) r", ["CAPTURE-C1", "REFUND-C1"]);
      expect((again.rows[0] as { r: string }).r).toBe("ALREADY_REFUNDED");
    });

    it("ningún cliente puede usarla, y una captura desconocida no toca nada", async () => {
      for (const who of [BUYER, SELLER, INTRUDER])
        await expect(asUser(who, "select public.record_payment_refund_by_capture($1,$2)", ["CAPTURE-C1", "X"])).rejects.toThrow(
          /REFUND_NOT_ALLOWED|permission denied/,
        );
      await expect(asServiceRole("select public.record_payment_refund_by_capture($1,$2)", ["CAPTURA-AJENA", "X"])).rejects.toThrow("NOT_FOUND");
    });
  });

  it("la migración no concede ningún permiso nuevo a los clientes", async () => {
    const { rows } = await db.query<{ privilege_type: string; grantee: string }>(
      "select privilege_type, grantee from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated')",
    );
    expect(rows.filter((r) => r.privilege_type !== "SELECT")).toEqual([]);
    expect(rows.some((r) => r.grantee === "anon")).toBe(false);
  });
});
