import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const A = "11111111-1111-4111-8111-111111111111",
  S = "33333333-3333-4333-8333-333333333333",
  STRANGER = "66666666-6666-4666-8666-666666666666";

let db: PGlite;
let examplePacto: string, otherPacto: string;

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
  await db.query("insert into auth.users(id) values($1),($2),($3)", [A, S, STRANGER]);
  for (const file of [
    "supabase/migrations/202610020001_foundation.sql",
    "supabase/migrations/202610080001_closure_cancellation_ai.sql",
    "supabase/migrations/202610090001_roles_admin.sql",
    "supabase/migrations/202610100001_demo_example.sql",
  ]) {
    await db.exec(await readFile(file, "utf8"));
  }
  examplePacto = (
    await scalar<{ id: string }>(
      A,
      "select public.create_pacto('Ejemplo público','Alcance de ejemplo visible para cualquier visitante',1000) id",
    )
  ).id;
  await asUser(A, "select public.add_seller($1,$2)", [examplePacto, S]);
  otherPacto = (
    await scalar<{ id: string }>(
      A,
      "select public.create_pacto('Pacto privado de A','Alcance de un Pacto real que no es de ejemplo',1000) id",
    )
  ).id;
}, 30000);

afterAll(async () => {
  await db.close();
});

describe.sequential("demo example: public read-only visibility", () => {
  it("a stranger cannot see the pacto before it is marked as a demo example", async () => {
    expect((await asUser(STRANGER, "select id from public.pactos where id=$1", [examplePacto])).rows).toHaveLength(0);
  });

  it("clients cannot set is_demo_example themselves (no write grant on pactos)", async () => {
    await expect(
      asUser(A, "update public.pactos set is_demo_example=true where id=$1", [examplePacto]),
    ).rejects.toThrow("permission denied");
  });

  it("marks the pacto as a public demo example (the only real way: direct SQL by the owner)", async () => {
    await db.exec("reset role");
    await db.query("update public.pactos set is_demo_example=true where id=$1", [examplePacto]);
    await db.exec("reset role");
    expect((await scalar<{ r: boolean }>(STRANGER, "select public.is_demo_pacto($1) r", [examplePacto])).r).toBe(true);
  });

  it("any authenticated stranger can now read the example pacto, its agreement and audit trail", async () => {
    expect((await asUser(STRANGER, "select id from public.pactos where id=$1", [examplePacto])).rows).toHaveLength(1);
    expect(
      (await asUser(STRANGER, "select user_id from public.participants where pacto_id=$1", [examplePacto])).rows,
    ).toHaveLength(2);
    expect(
      (await asUser(STRANGER, "select id from public.agreements where pacto_id=$1", [examplePacto])).rows.length,
    ).toBeGreaterThan(0);
    expect(
      (await asUser(STRANGER, "select id from public.audit_events where pacto_id=$1", [examplePacto])).rows.length,
    ).toBeGreaterThan(0);
  });

  it("the demo-example read grant never extends to a real, unmarked pacto", async () => {
    expect((await asUser(STRANGER, "select id from public.pactos where id=$1", [otherPacto])).rows).toHaveLength(0);
    expect(
      (await asUser(STRANGER, "select id from public.agreements where pacto_id=$1", [otherPacto])).rows,
    ).toHaveLength(0);
  });

  it("a stranger still cannot mutate the example pacto through any RPC", async () => {
    await expect(
      asUser(STRANGER, "select public.cancel_pacto($1,$2)", [examplePacto, "Intento ajeno sobre el ejemplo"]),
    ).rejects.toThrow("NOT_FOUND");
    const agreementId = (
      await asUser(STRANGER, "select id from public.agreements where pacto_id=$1 limit 1", [examplePacto])
    ).rows[0] as { id: string };
    await expect(
      asUser(STRANGER, "select public.accept_agreement($1)", [agreementId.id]),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("anonymous (unauthenticated) role still cannot read anything, demo or not", async () => {
    await db.exec("reset role; set role anon");
    await expect(db.query("select * from public.pactos")).rejects.toThrow("permission denied");
  });

  it("a brand-new Supabase anonymous-sign-in user (auth.users row, no email) gets role='user' and no admin access", async () => {
    // Las sesiones anónimas de Supabase crean una fila real en auth.users (sin correo),
    // con role 'authenticated' en el JWT; el trigger de alta las trata igual que a
    // cualquier usuario nuevo.
    const visitor = "77777777-7777-4777-8777-777777777777";
    await db.exec("reset role");
    await db.query("insert into auth.users(id) values($1)", [visitor]);
    expect((await scalar<{ role: string }>(visitor, "select role from public.profiles where id=$1", [visitor])).role).toBe(
      "user",
    );
    expect((await scalar<{ r: boolean }>(visitor, "select public.is_admin() r")).r).toBe(false);
    // Puede ver el ejemplo público igual que cualquier otro visitante, y solo eso.
    expect((await asUser(visitor, "select id from public.pactos where id=$1", [examplePacto])).rows).toHaveLength(1);
    expect((await asUser(visitor, "select id from public.pactos where id=$1", [otherPacto])).rows).toHaveLength(0);
  });
});
