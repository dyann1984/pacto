import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const BUYER = "11111111-1111-4111-8111-111111111111",
  SELLER = "33333333-3333-4333-8333-333333333333",
  INTRUDER = "66666666-6666-4666-8666-666666666666",
  NAMED = "88888888-8888-4888-8888-888888888888";

let db: PGlite;
let pacto: string, token: string;

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
    "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key, email text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;",
  );
  await db.query(
    "insert into auth.users(id,email) values($1,'comprador@example.com'),($2,'proveedor@example.com'),($3,'intruso@example.com'),($4,'nombrado@example.com')",
    [BUYER, SELLER, INTRUDER, NAMED],
  );
  for (const file of [
    "supabase/migrations/202610020001_foundation.sql",
    "supabase/migrations/202610080001_closure_cancellation_ai.sql",
    "supabase/migrations/202610090001_roles_admin.sql",
    "supabase/migrations/202610100001_demo_example.sql",
    "supabase/migrations/202610110001_invitations.sql",
  ]) {
    await db.exec(await readFile(file, "utf8"));
  }
  pacto = (
    await scalar<{ id: string }>(
      BUYER,
      "select public.create_pacto('Impermeabilización','Impermeabilizar la cubierta según el plan acordado',150000) id",
    )
  ).id;
}, 30000);

afterAll(async () => {
  await db.close();
});

describe.sequential("invitations: secure link instead of a raw user id", () => {
  it("only the buyer can create an invitation", async () => {
    await expect(asUser(INTRUDER, "select public.create_invitation($1)", [pacto])).rejects.toThrow("NOT_FOUND");
    token = (await scalar<{ t: string }>(BUYER, "select public.create_invitation($1) t", [pacto])).t;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stores only a hash of the token, and clients cannot read even that", async () => {
    await db.exec("reset role");
    const { rows } = await db.query<{ token_sha256: string }>("select token_sha256 from public.invitations");
    expect(rows[0].token_sha256).not.toBe(token);
    await expect(asUser(BUYER, "select token_sha256 from public.invitations")).rejects.toThrow("permission denied");
    expect((await asUser(BUYER, "select id, accepted_at from public.invitations")).rows).toHaveLength(1);
  });

  it("a wrong token reveals nothing", async () => {
    const preview = await scalar<{ p: { status: string; title?: string } }>(
      INTRUDER,
      "select public.invitation_preview($1) p",
      ["0".repeat(64)],
    );
    expect(preview.p).toEqual({ status: "NOT_FOUND" });
    await expect(asUser(INTRUDER, "select public.accept_invitation($1)", ["0".repeat(64)])).rejects.toThrow(
      "INVITATION_NOT_FOUND",
    );
  });

  it("the invited person sees what they are joining before accepting", async () => {
    const preview = await scalar<{ p: { status: string; title: string; total_cents: number } }>(
      SELLER,
      "select public.invitation_preview($1) p",
      [token],
    );
    expect(preview.p.status).toBe("OPEN");
    expect(preview.p.title).toBe("Impermeabilización");
    expect(Number(preview.p.total_cents)).toBe(150000);
  });

  it("the buyer cannot accept their own invitation", async () => {
    await expect(asUser(BUYER, "select public.accept_invitation($1)", [token])).rejects.toThrow(
      "DISTINCT_PARTIES_REQUIRED",
    );
  });

  it("accepting adds the seller once; the link cannot be reused by anyone else", async () => {
    expect((await scalar<{ id: string }>(SELLER, "select public.accept_invitation($1) id", [token])).id).toBe(pacto);
    // Reabrir el enlace propio es idempotente.
    expect((await scalar<{ id: string }>(SELLER, "select public.accept_invitation($1) id", [token])).id).toBe(pacto);
    await expect(asUser(INTRUDER, "select public.accept_invitation($1)", [token])).rejects.toThrow("INVITATION_USED");
    expect(
      (await scalar<{ p: { status: string } }>(INTRUDER, "select public.invitation_preview($1) p", [token])).p,
    ).toEqual({ status: "USED" });
    expect((await asUser(INTRUDER, "select id from public.pactos where id=$1", [pacto])).rows).toHaveLength(0);
  });

  it("no new invitation once a seller has joined", async () => {
    await expect(asUser(BUYER, "select public.create_invitation($1)", [pacto])).rejects.toThrow(
      "SELLER_ALREADY_JOINED",
    );
  });

  it("participants see each other by email, never by raw id; strangers see nothing", async () => {
    const { rows } = await asUser(BUYER, "select role, label from public.participant_directory($1) order by role", [
      pacto,
    ]);
    expect(rows).toEqual([
      { role: "BUYER", label: "comprador@example.com" },
      { role: "SELLER", label: "proveedor@example.com" },
    ]);
    expect((await asUser(INTRUDER, "select * from public.participant_directory($1)", [pacto])).rows).toHaveLength(0);
  });

  it("the full journey works after joining by link: review, two acceptances, two closures", async () => {
    const agreement = (await scalar<{ id: string }>(BUYER, "select id from public.agreements where pacto_id=$1", [pacto]))
      .id;
    await asUser(BUYER, "select public.submit_agreement($1)", [agreement]);
    await asUser(SELLER, "select public.accept_agreement($1)", [agreement]);
    await asUser(BUYER, "select public.accept_agreement($1)", [agreement]);
    expect((await scalar<{ state: string }>(BUYER, "select state from public.agreements where id=$1", [agreement])).state).toBe(
      "ACCEPTED",
    );
    expect((await scalar<{ r: string }>(BUYER, "select public.confirm_closure($1,'') r", [pacto])).r).toBe("CONFIRMED");
    expect((await scalar<{ r: string }>(SELLER, "select public.confirm_closure($1,'Entregado') r", [pacto])).r).toBe(
      "CLOSED",
    );
  });

  it("an email-restricted invitation only works for that account", async () => {
    const second = (
      await scalar<{ id: string }>(BUYER, "select public.create_pacto('Segundo acuerdo','Alcance del segundo acuerdo de prueba',1000) id")
    ).id;
    const restricted = (
      await scalar<{ t: string }>(BUYER, "select public.create_invitation($1,$2) t", [second, "Nombrado@Example.com"])
    ).t;
    await expect(asUser(INTRUDER, "select public.accept_invitation($1)", [restricted])).rejects.toThrow(
      "INVITATION_EMAIL_MISMATCH",
    );
    expect((await scalar<{ id: string }>(NAMED, "select public.accept_invitation($1) id", [restricted])).id).toBe(second);
  });

  it("creating a new link revokes the previous open one", async () => {
    const third = (
      await scalar<{ id: string }>(BUYER, "select public.create_pacto('Tercer acuerdo','Alcance del tercer acuerdo de prueba',1000) id")
    ).id;
    const first = (await scalar<{ t: string }>(BUYER, "select public.create_invitation($1) t", [third])).t;
    const latest = (await scalar<{ t: string }>(BUYER, "select public.create_invitation($1) t", [third])).t;
    await expect(asUser(SELLER, "select public.accept_invitation($1)", [first])).rejects.toThrow("INVITATION_USED");
    expect((await scalar<{ id: string }>(SELLER, "select public.accept_invitation($1) id", [latest])).id).toBe(third);
  });

  it("an expired link cannot be used and reveals nothing", async () => {
    const pactoId = (
      await scalar<{ id: string }>(BUYER, "select public.create_pacto('Acuerdo caducado','Alcance de un acuerdo con enlace caducado',1000) id")
    ).id;
    const expired = (await scalar<{ t: string }>(BUYER, "select public.create_invitation($1) t", [pactoId])).t;
    await db.exec("reset role");
    await db.query("update public.invitations set expires_at=now()-interval '1 minute' where pacto_id=$1", [pactoId]);
    expect((await scalar<{ p: unknown }>(SELLER, "select public.invitation_preview($1) p", [expired])).p).toEqual({
      status: "EXPIRED",
    });
    await expect(asUser(SELLER, "select public.accept_invitation($1)", [expired])).rejects.toThrow("INVITATION_EXPIRED");
  });

  it("a cancelled pacto accepts no invitation, old or new", async () => {
    const pactoId = (
      await scalar<{ id: string }>(BUYER, "select public.create_pacto('Acuerdo cancelado','Alcance de un acuerdo que se cancelará',1000) id")
    ).id;
    const link = (await scalar<{ t: string }>(BUYER, "select public.create_invitation($1) t", [pactoId])).t;
    await asUser(BUYER, "select public.cancel_pacto($1,$2)", [pactoId, "Cancelado antes de invitar"]);
    await expect(asUser(SELLER, "select public.accept_invitation($1)", [link])).rejects.toThrow("PACTO_NOT_ACTIVE");
    await expect(asUser(BUYER, "select public.create_invitation($1)", [pactoId])).rejects.toThrow("PACTO_NOT_ACTIVE");
  });

  it("a DEMO visitor (no email) cannot take an email-restricted invitation", async () => {
    const visitor = "77777777-7777-4777-8777-777777777777";
    await db.exec("reset role");
    await db.query("insert into auth.users(id) values($1)", [visitor]);
    const pactoId = (
      await scalar<{ id: string }>(BUYER, "select public.create_pacto('Acuerdo restringido','Alcance de un acuerdo con invitación nominal',1000) id")
    ).id;
    const link = (
      await scalar<{ t: string }>(BUYER, "select public.create_invitation($1,$2) t", [pactoId, "proveedor@example.com"])
    ).t;
    await expect(asUser(visitor, "select public.accept_invitation($1)", [link])).rejects.toThrow(
      "INVITATION_EMAIL_MISMATCH",
    );
  });

  it("anonymous (unauthenticated) role cannot call any invitation RPC", async () => {
    await db.exec("reset role; set role anon");
    await expect(db.query("select public.invitation_preview($1)", [token])).rejects.toThrow("permission denied");
    await db.exec("reset role");
  });
});
