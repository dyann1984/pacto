import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222",
  S = "33333333-3333-4333-8333-333333333333";
let db: PGlite, pactoA: string, pactoB: string, agreementA: string;
async function asUser(id: string, query: string, params: unknown[] = []) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
  return db.query(query, params);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;",
  );
  await db.query("insert into auth.users values($1),($2),($3)", [A, B, S]);
  await db.exec(
    await readFile("supabase/migrations/202610020001_foundation.sql", "utf8"),
  );
  pactoA = (
    (
      await asUser(
        A,
        "select public.create_pacto('Acuerdo A','Impermeabilizar cubierta acordada',1740000) id",
      )
    ).rows[0] as { id: string }
  ).id;
  pactoB = (
    (
      await asUser(
        B,
        "select public.create_pacto('Acuerdo B','Pintar estancia acordada',20000) id",
      )
    ).rows[0] as { id: string }
  ).id;
  agreementA = (
    (
      await asUser(A, "select id from public.agreements where pacto_id=$1", [
        pactoA,
      ])
    ).rows[0] as { id: string }
  ).id;
  await asUser(A, "select public.add_seller($1,$2)", [pactoA, S]);
  await asUser(B, "select public.add_seller($1,$2)", [pactoB, A]);
}, 30000);
afterAll(async () => {
  await db.close();
});
describe.sequential("real PostgreSQL RLS and RPC permissions in PGlite", () => {
  it("persists two Pactos and enforces owner visibility", async () => {
    expect((await asUser(B, "select id from public.pactos")).rows).toHaveLength(
      1,
    );
    expect((await asUser(S, "select id from public.pactos")).rows).toHaveLength(
      1,
    );
  });
  it("IDOR: seller A cannot read Pacto B or its agreements/history", async () => {
    for (const table of [
      "pactos",
      "participants",
      "agreements",
      "audit_events",
    ]) {
      const key = table === "pactos" ? "id" : "pacto_id";
      expect(
        (
          await asUser(S, `select * from public.${table} where ${key}=$1`, [
            pactoB,
          ])
        ).rows,
      ).toHaveLength(0);
    }
  });
  it("IDOR: buyer B cannot mutate or accept A", async () => {
    await expect(
      asUser(B, "select public.accept_agreement($1)", [agreementA]),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      asUser(B, "select public.revise_agreement($1,$2,$3)", [
        agreementA,
        "Alcance ajeno modificado",
        10000,
      ]),
    ).rejects.toThrow("NOT_FOUND");
  });
  it("rejects browser writes to audit, roles and agreements", async () => {
    await expect(
      asUser(
        A,
        "insert into public.audit_events(pacto_id,actor_id,event_type,object_id) values($1,$2,'FORGED',$1)",
        [pactoA, A],
      ),
    ).rejects.toThrow("permission denied");
    await expect(
      asUser(
        S,
        "update public.participants set role='BUYER' where pacto_id=$1",
        [pactoA],
      ),
    ).rejects.toThrow("permission denied");
    await expect(
      asUser(A, "update public.agreements set state='ACCEPTED' where id=$1", [
        agreementA,
      ]),
    ).rejects.toThrow("permission denied");
  });
  it("requires review and two distinct authenticated acceptances", async () => {
    await expect(
      asUser(A, "select public.accept_agreement($1)", [agreementA]),
    ).rejects.toThrow("INVALID_TRANSITION");
    await asUser(A, "select public.submit_agreement($1)", [agreementA]);
    await asUser(A, "select public.accept_agreement($1)", [agreementA]);
    await asUser(A, "select public.accept_agreement($1)", [agreementA]);
    expect(
      (
        (
          await asUser(A, "select state from public.agreements where id=$1", [
            agreementA,
          ])
        ).rows[0] as { state: string }
      ).state,
    ).toBe("REVIEW");
    await asUser(S, "select public.accept_agreement($1)", [agreementA]);
    expect(
      (
        (
          await asUser(A, "select state from public.agreements where id=$1", [
            agreementA,
          ])
        ).rows[0] as { state: string }
      ).state,
    ).toBe("ACCEPTED");
  });
  it("preserves accepted version and starts a new draft without inherited signatures", async () => {
    const n = (
      (
        await asUser(A, "select public.revise_agreement($1,$2,$3) id", [
          agreementA,
          "Nueva propuesta de alcance claramente definida",
          1800000,
        ])
      ).rows[0] as { id: string }
    ).id;
    expect(
      (
        await asUser(
          A,
          "select version,state from public.agreements where pacto_id=$1 order by version",
          [pactoA],
        )
      ).rows,
    ).toEqual([
      { version: 1, state: "ACCEPTED" },
      { version: 2, state: "DRAFT" },
    ]);
    expect(
      (
        await asUser(
          A,
          "select * from public.acceptances where agreement_id=$1",
          [n],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("creates audit events with authenticated actor, no client-provided event payload", async () => {
    const events = (
      await asUser(
        S,
        "select event_type,actor_id from public.audit_events where pacto_id=$1",
        [pactoA],
      )
    ).rows as { event_type: string; actor_id: string }[];
    expect(
      events.some((e) => e.event_type === "PACTO_CREATED" && e.actor_id === A),
    ).toBe(true);
    expect(
      events.filter((e) => e.event_type === "AGREEMENT_ACCEPTED"),
    ).toHaveLength(2);
    expect(events.some((e) => e.event_type === "FORGED")).toBe(false);
  });
  it("supersedes old version only after both parties accept the replacement", async () => {
    const n = (
      (
        await asUser(
          A,
          "select id from public.agreements where pacto_id=$1 and version=2",
          [pactoA],
        )
      ).rows[0] as { id: string }
    ).id;
    await asUser(A, "select public.submit_agreement($1)", [n]);
    await asUser(A, "select public.accept_agreement($1)", [n]);
    expect(
      (
        (
          await asUser(A, "select state from public.agreements where id=$1", [
            agreementA,
          ])
        ).rows[0] as { state: string }
      ).state,
    ).toBe("ACCEPTED");
    await asUser(S, "select public.accept_agreement($1)", [n]);
    expect(
      (
        await asUser(
          A,
          "select version,state from public.agreements where pacto_id=$1 order by version",
          [pactoA],
        )
      ).rows,
    ).toEqual([
      { version: 1, state: "SUPERSEDED" },
      { version: 2, state: "ACCEPTED" },
    ]);
  });
  it("does not treat buyer on B as buyer on A", async () => {
    await expect(
      asUser(S, "select public.add_seller($1,$2)", [pactoB, S]),
    ).rejects.toThrow("NOT_FOUND");
  });
  it("anonymous role cannot read or execute mutations", async () => {
    await db.exec("reset role; set role anon");
    await expect(db.query("select * from public.pactos")).rejects.toThrow(
      "permission denied",
    );
    await expect(
      db.query(
        "select public.create_pacto('Fake Pacto','Fake scope sufficient',100)",
      ),
    ).rejects.toThrow("permission denied");
  });
});
