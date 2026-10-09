import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222",
  S = "33333333-3333-4333-8333-333333333333",
  X = "44444444-4444-4444-8444-444444444444";
const HASH = "a".repeat(64);

let db: PGlite;
let pactoB: string, agreementB: string, pactoCancel: string;

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

beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;",
  );
  await db.query("insert into auth.users values($1),($2),($3),($4)", [A, B, S, X]);
  for (const file of [
    "supabase/migrations/202610020001_foundation.sql",
    "supabase/migrations/202610080001_closure_cancellation_ai.sql",
  ]) {
    await db.exec(await readFile(file, "utf8"));
  }
  // Pacto B: comprador B, proveedor A (identidades distintas por construcción).
  pactoB = (
    await scalar<{ id: string }>(
      B,
      "select public.create_pacto('Cierre de prueba','Pintar estancia acordada',20000) id",
    )
  ).id;
  await asUser(B, "select public.add_seller($1,$2)", [pactoB, A]);
  agreementB = (
    await scalar<{ id: string }>(
      B,
      "select id from public.agreements where pacto_id=$1",
      [pactoB],
    )
  ).id;
  pactoCancel = (
    await scalar<{ id: string }>(
      S,
      "select public.create_pacto('Cancelación de prueba','Entrega de muestras acordada',5000) id",
    )
  ).id;
}, 30000);

afterAll(async () => {
  await db.close();
});

describe.sequential("cierre, cancelación y evidencia de IA", () => {
  it("does not allow closing while a draft proposal is pending", async () => {
    await expect(
      asUser(B, "select public.confirm_closure($1,$2)", [pactoB, "Listo"]),
    ).rejects.toThrow("PENDING_PROPOSAL");
  });

  it("does not allow closure confirmation on a pacto without an accepted agreement", async () => {
    // El Pacto recién creado tiene un borrador: la regla de propuesta pendiente aplica primero.
    await expect(
      asUser(S, "select public.confirm_closure($1,$2)", [pactoCancel, ""]),
    ).rejects.toThrow("PENDING_PROPOSAL");
  });

  it("accepts the agreement through the normal two-party flow", async () => {
    await asUser(B, "select public.submit_agreement($1)", [agreementB]);
    await asUser(B, "select public.accept_agreement($1)", [agreementB]);
    await asUser(A, "select public.accept_agreement($1)", [agreementB]);
    expect(
      (
        await scalar<{ state: string }>(
          B,
          "select state from public.agreements where id=$1",
          [agreementB],
        )
      ).state,
    ).toBe("ACCEPTED");
  });

  it("rejects closure confirmations from non-participants", async () => {
    await expect(
      asUser(S, "select public.confirm_closure($1,$2)", [pactoB, "Intento ajeno"]),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("keeps the pacto ACTIVE after a single confirmation and records it", async () => {
    const first = await scalar<{ result: string }>(
      B,
      "select public.confirm_closure($1,$2) result",
      [pactoB, "Entrega verificada por el comprador"],
    );
    expect(first.result).toBe("CONFIRMED");
    expect(
      (
        await scalar<{ status: string }>(
          B,
          "select status from public.pactos where id=$1",
          [pactoB],
        )
      ).status,
    ).toBe("ACTIVE");
  });

  it("hides confirmations from non-members and closes only after both parties confirm", async () => {
    expect(
      (await asUser(X, "select * from public.closure_confirmations")).rows,
    ).toHaveLength(0);
    const second = await scalar<{ result: string }>(
      A,
      "select public.confirm_closure($1,$2) result",
      [pactoB, "Proveedor confirma entrega"],
    );
    expect(second.result).toBe("CLOSED");
    const pacto = await scalar<{ status: string; status_changed_at: string | null }>(
      A,
      "select status,status_changed_at from public.pactos where id=$1",
      [pactoB],
    );
    expect(pacto.status).toBe("CLOSED");
    expect(pacto.status_changed_at).not.toBeNull();
  });

  it("blocks every mutation on a closed pacto", async () => {
    await expect(
      asUser(B, "select public.revise_agreement($1,$2,$3)", [
        agreementB,
        "Cambio posterior al cierre",
        30000,
      ]),
    ).rejects.toThrow("PACTO_NOT_ACTIVE");
    await expect(
      asUser(B, "select public.cancel_pacto($1,$2)", [
        pactoB,
        "Cancelación tras cierre",
      ]),
    ).rejects.toThrow("PACTO_NOT_ACTIVE");
    await expect(
      asUser(B, "select public.confirm_closure($1,$2)", [pactoB, ""]),
    ).rejects.toThrow("PACTO_NOT_ACTIVE");
  });

  it("writes auditable closure evidence with actor and note", async () => {
    const events = (
      await asUser(
        B,
        "select event_type,actor_id,detail from public.audit_events where pacto_id=$1 and event_type in ('CLOSURE_CONFIRMED','PACTO_CLOSED') order by created_at",
        [pactoB],
      )
    ).rows as { event_type: string; actor_id: string; detail: string | null }[];
    // created_at puede coincidir entre la confirmación final y PACTO_CLOSED: no depender del orden.
    expect(events.map((e) => e.event_type).sort()).toEqual([
      "CLOSURE_CONFIRMED",
      "CLOSURE_CONFIRMED",
      "PACTO_CLOSED",
    ]);
    const buyerEvent = events.find((e) => e.actor_id === B);
    expect(buyerEvent?.event_type).toBe("CLOSURE_CONFIRMED");
    expect(buyerEvent?.detail).toBe("Entrega verificada por el comprador");
  });

  it("requires a meaningful reason to cancel and then cancels with evidence", async () => {
    await expect(
      asUser(S, "select public.cancel_pacto($1,$2)", [pactoCancel, "corto"]),
    ).rejects.toThrow("INVALID_INPUT");
    await asUser(S, "select public.cancel_pacto($1,$2)", [
      pactoCancel,
      "El comprador no respondió a la propuesta",
    ]);
    const row = await scalar<{ status: string; status_reason: string }>(
      S,
      "select status,status_reason from public.pactos where id=$1",
      [pactoCancel],
    );
    expect(row).toEqual({
      status: "CANCELLED",
      status_reason: "El comprador no respondió a la propuesta",
    });
    await expect(
      asUser(S, "select public.add_seller($1,$2)", [pactoCancel, X]),
    ).rejects.toThrow("PACTO_NOT_ACTIVE");
  });

  it("does not allow a non-participant to cancel a pacto", async () => {
    await expect(
      asUser(X, "select public.cancel_pacto($1,$2)", [
        pactoCancel,
        "Intento de cancelación ajena",
      ]),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("records AI analysis only for participants and exposes it through RLS", async () => {
    const id = (
      await scalar<{ id: string }>(
        A,
        "select public.record_ai_analysis($1,$2,$3,$4::jsonb) id",
        [
          agreementB,
          "claude-sonnet-5-5",
          HASH,
          JSON.stringify({ findings: [], summary: "Sin hallazgos de prueba" }),
        ],
      )
    ).id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      (await asUser(A, "select id from public.ai_analyses where agreement_id=$1", [agreementB])).rows,
    ).toHaveLength(1);
    expect(
      (await asUser(X, "select id from public.ai_analyses")).rows,
    ).toHaveLength(0);
    await expect(
      asUser(X, "select public.record_ai_analysis($1,$2,$3,$4::jsonb)", [
        agreementB,
        "claude-sonnet-5-5",
        HASH,
        "{}",
      ]),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("rejects malformed AI evidence (bad hash, non-object result)", async () => {
    await expect(
      asUser(A, "select public.record_ai_analysis($1,$2,$3,$4::jsonb)", [
        agreementB,
        "claude-sonnet-5-5",
        "not-a-hash",
        "{}",
      ]),
    ).rejects.toThrow();
    await expect(
      asUser(A, "select public.record_ai_analysis($1,$2,$3,$4::jsonb)", [
        agreementB,
        "claude-sonnet-5-5",
        HASH,
        "[]",
      ]),
    ).rejects.toThrow();
  });

  it("denies direct writes to closures and AI evidence tables", async () => {
    await expect(
      asUser(
        B,
        "insert into public.closure_confirmations(pacto_id,agreement_id,user_id) values($1,$2,$3)",
        [pactoB, agreementB, B],
      ),
    ).rejects.toThrow("permission denied");
    await expect(
      asUser(
        A,
        "insert into public.ai_analyses(pacto_id,agreement_id,requested_by,provider,model,input_sha256,result) values($1,$2,$3,'ANTHROPIC','m','{}'::text,'{}'::jsonb)",
        [pactoB, agreementB, A],
      ),
    ).rejects.toThrow("permission denied");
  });
});
