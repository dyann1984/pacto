import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

const FOUNDATION = "supabase/migrations/202610020001_foundation.sql";
const CLOSURE = "supabase/migrations/202610080001_closure_cancellation_ai.sql";
const ROLES = "supabase/migrations/202610090001_roles_admin.sql";
const DEMO = "supabase/migrations/202610100001_demo_example.sql";
const INVITATIONS = "supabase/migrations/202610110001_invitations.sql";
const PREFLIGHT ="supabase/preflight.sql";

const databases: PGlite[] = [];

// Base mínima que simula el entorno de Supabase: roles, schema auth y auth.uid().
async function freshDatabase() {
  const db = new PGlite();
  databases.push(db);
  await db.exec(
    "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key, email text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;",
  );
  return db;
}

async function preflight(db: PGlite) {
  const { rows } = await db.query<{ check_name: string; ok: boolean }>(
    await readFile(PREFLIGHT, "utf8"),
  );
  return Object.fromEntries(rows.map((r) => [r.check_name, r.ok]));
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((db) => db.close()));
});

describe("migration sequencing and safety", () => {
  it("preflight reports an empty database as not migrated", async () => {
    const db = await freshDatabase();
    const state = await preflight(db);
    expect(Object.values(state).every((ok) => ok === false)).toBe(true);
  });

  it("applies foundation, closure/AI and roles/admin in order, each stage adding to the state", async () => {
    const db = await freshDatabase();
    await db.exec(await readFile(FOUNDATION, "utf8"));
    const afterFoundation = await preflight(db);
    expect(afterFoundation["foundation: tabla participants"]).toBe(true);
    expect(afterFoundation["cierre: columna pactos.status"]).toBe(false);
    expect(afterFoundation["roles: columna profiles.role"]).toBe(false);

    await db.exec(await readFile(CLOSURE, "utf8"));
    const afterClosure = await preflight(db);
    expect(afterClosure["cierre: tabla closure_confirmations"]).toBe(true);
    expect(afterClosure["roles: rpc admin_list_users"]).toBe(false);

    await db.exec(await readFile(ROLES, "utf8"));
    const afterRoles = await preflight(db);
    expect(afterRoles["roles: rpc admin_list_users"]).toBe(true);
    expect(afterRoles["demo: columna pactos.is_demo_example"]).toBe(false);

    await db.exec(await readFile(DEMO, "utf8"));
    const afterDemo = await preflight(db);
    expect(afterDemo["demo: rpc is_demo_pacto"]).toBe(true);
    expect(afterDemo["invitaciones: tabla invitations"]).toBe(false);

    await db.exec(await readFile(INVITATIONS, "utf8"));
    const afterInvitations = await preflight(db);
    expect(Object.values(afterInvitations).every((ok) => ok === true)).toBe(true);
  });

  it("refuses to run the invitations migration before demo-example, and a re-run aborts", async () => {
    const db = await freshDatabase();
    await db.exec(await readFile(FOUNDATION, "utf8"));
    await db.exec(await readFile(CLOSURE, "utf8"));
    await db.exec(await readFile(ROLES, "utf8"));
    await expect(db.exec(await readFile(INVITATIONS, "utf8"))).rejects.toThrow("PREREQUISITE_MISSING");
    await db.exec("rollback");
    expect((await preflight(db))["invitaciones: tabla invitations"]).toBe(false);
    await db.exec(await readFile(DEMO, "utf8"));
    await db.exec(await readFile(INVITATIONS, "utf8"));
    await expect(db.exec(await readFile(INVITATIONS, "utf8"))).rejects.toThrow("MIGRATION_ALREADY_APPLIED");
    await db.exec("rollback");
    expect((await preflight(db))["invitaciones: rpc accept_invitation"]).toBe(true);
  });

  it("the invitations migration adds no write grant for anon or authenticated", async () => {
    const db = await freshDatabase();
    for (const file of [FOUNDATION, CLOSURE, ROLES, DEMO, INVITATIONS]) await db.exec(await readFile(file, "utf8"));
    const { rows } = await db.query<{ privilege_type: string; grantee: string }>(
      "select privilege_type, grantee from information_schema.role_column_grants where table_schema='public' and table_name='invitations' and grantee in ('anon','authenticated')",
    );
    expect(rows.filter((r) => r.privilege_type !== "SELECT")).toEqual([]);
    expect(rows.some((r) => r.grantee === "anon")).toBe(false);
  });

  it("foundation is also guarded: a re-run aborts and leaves data untouched", async () => {
    const db = await freshDatabase();
    await db.exec(await readFile(FOUNDATION, "utf8"));
    await db.query("insert into auth.users(id) values('11111111-1111-4111-8111-111111111111')");
    await expect(db.exec(await readFile(FOUNDATION, "utf8"))).rejects.toThrow(
      "MIGRATION_ALREADY_APPLIED",
    );
    await db.exec("rollback");
    const { rows } = await db.query("select count(*)::int as n from auth.users");
    expect(rows[0]).toEqual({ n: 1 });
    expect((await preflight(db))["foundation: tabla participants"]).toBe(true);
  });

  it("refuses to run the closure migration before foundation", async () => {
    const db = await freshDatabase();
    await expect(db.exec(await readFile(CLOSURE, "utf8"))).rejects.toThrow(
      "PREREQUISITE_MISSING",
    );
    // Tras un error la transacción queda abortada: el procedimiento exige ROLLBACK antes de seguir.
    await db.exec("rollback");
    // La transacción se revirtió: no quedó ninguna tabla nueva.
    const state = await preflight(db);
    expect(state["cierre: tabla closure_confirmations"]).toBe(false);
  });

  it("refuses to run the roles/admin migration before closure/AI", async () => {
    const db = await freshDatabase();
    await db.exec(await readFile(FOUNDATION, "utf8"));
    await expect(db.exec(await readFile(ROLES, "utf8"))).rejects.toThrow(
      "PREREQUISITE_MISSING",
    );
    await db.exec("rollback");
    expect((await preflight(db))["roles: columna profiles.role"]).toBe(false);
  });

  it("refuses to run the demo-example migration before roles/admin", async () => {
    const db = await freshDatabase();
    await db.exec(await readFile(FOUNDATION, "utf8"));
    await db.exec(await readFile(CLOSURE, "utf8"));
    await expect(db.exec(await readFile(DEMO, "utf8"))).rejects.toThrow("PREREQUISITE_MISSING");
    await db.exec("rollback");
    expect((await preflight(db))["demo: columna pactos.is_demo_example"]).toBe(false);
  });

  it("is safe to retry: a second run of any migration aborts without partial changes", async () => {
    const db = await freshDatabase();
    await db.exec(await readFile(FOUNDATION, "utf8"));
    await db.exec(await readFile(CLOSURE, "utf8"));
    await expect(db.exec(await readFile(CLOSURE, "utf8"))).rejects.toThrow(
      "MIGRATION_ALREADY_APPLIED",
    );
    await db.exec("rollback");
    await db.exec(await readFile(ROLES, "utf8"));
    await expect(db.exec(await readFile(ROLES, "utf8"))).rejects.toThrow(
      "MIGRATION_ALREADY_APPLIED",
    );
    await db.exec("rollback");
    await db.exec(await readFile(DEMO, "utf8"));
    await expect(db.exec(await readFile(DEMO, "utf8"))).rejects.toThrow(
      "MIGRATION_ALREADY_APPLIED",
    );
    await db.exec("rollback");
    await db.exec(await readFile(INVITATIONS, "utf8"));
    const state = await preflight(db);
    expect(Object.values(state).every((ok) => ok === true)).toBe(true);
  });

  it("keeps closure/AI tables without anon or authenticated write grants", async () => {
    const db = await freshDatabase();
    await db.exec(await readFile(FOUNDATION, "utf8"));
    await db.exec(await readFile(CLOSURE, "utf8"));
    const { rows } = await db.query<{ table_name: string; privilege_type: string; grantee: string }>(
      "select table_name, privilege_type, grantee from information_schema.role_table_grants where table_schema='public' and table_name in ('closure_confirmations','ai_analyses') and grantee in ('anon','authenticated')",
    );
    expect(rows.filter((r) => r.privilege_type !== "SELECT")).toEqual([]);
    expect(rows.some((r) => r.grantee === "anon")).toBe(false);
  });

  it("keeps profiles without anon or authenticated write grants after roles/admin", async () => {
    const db = await freshDatabase();
    await db.exec(await readFile(FOUNDATION, "utf8"));
    await db.exec(await readFile(CLOSURE, "utf8"));
    await db.exec(await readFile(ROLES, "utf8"));
    const { rows } = await db.query<{ privilege_type: string; grantee: string }>(
      "select privilege_type, grantee from information_schema.role_table_grants where table_schema='public' and table_name='profiles' and grantee in ('anon','authenticated')",
    );
    expect(rows.filter((r) => r.privilege_type !== "SELECT")).toEqual([]);
    expect(rows.some((r) => r.grantee === "anon")).toBe(false);
  });

  it("the demo-example migration adds no write grant on pactos for anon or authenticated", async () => {
    const db = await freshDatabase();
    await db.exec(await readFile(FOUNDATION, "utf8"));
    await db.exec(await readFile(CLOSURE, "utf8"));
    await db.exec(await readFile(ROLES, "utf8"));
    await db.exec(await readFile(DEMO, "utf8"));
    const { rows } = await db.query<{ privilege_type: string; grantee: string }>(
      "select privilege_type, grantee from information_schema.role_table_grants where table_schema='public' and table_name='pactos' and grantee in ('anon','authenticated')",
    );
    expect(rows.filter((r) => r.privilege_type !== "SELECT")).toEqual([]);
    expect(rows.some((r) => r.grantee === "anon")).toBe(false);
  });
});
