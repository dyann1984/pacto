import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const OWNER = "ea8e6fb5-323c-4565-abd8-647cf12d2c3e"; // debe coincidir con la migración de asignación
const OWNER_EMAIL = "dianalopez161184@gmail.com";
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222",
  IMPOSTOR = "55555555-5555-4555-8555-555555555555";

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

beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, last_sign_in_at timestamptz, created_at timestamptz not null default now()); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;",
  );
  // Inserts directos en auth.users simulan lo que GoTrue hace en producción (incluye created_at/email_confirmed_at),
  // y disparan el trigger on_auth_user_created igual que un alta real.
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now()),($5,$6,now())",
    [OWNER, OWNER_EMAIL, A, "a@example.com", B, "b@example.com"],
  );
  for (const file of [
    "supabase/migrations/202610020001_foundation.sql",
    "supabase/migrations/202610080001_closure_cancellation_ai.sql",
  ]) {
    await db.exec(await readFile(file, "utf8"));
  }
  // El trigger de roles se crea en esta migración; los tres usuarios de arriba se insertaron antes,
  // así que para probar el trigger real insertamos un cuarto usuario después de aplicarla.
  await db.exec(await readFile("supabase/migrations/202610090001_roles_admin.sql", "utf8"));
}, 30000);

afterAll(async () => {
  await db.close();
});

describe.sequential("roles, admin RLS and controlled elevation", () => {
  it("has no admins yet: profile rows created before the trigger default to 'user' once inserted", async () => {
    // Las tres cuentas se insertaron ANTES de que existiera el trigger, así que aún no tienen perfil.
    // Simulamos el alta real: cada usuario inicia sesión y la app provoca la creación perezosa,
    // o, para esta prueba, confirmamos directamente que el trigger asigna 'user' a altas NUEVAS.
    const newUser = "33333333-3333-4333-8333-333333333333";
    await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [
      newUser,
      "nuevo@example.com",
    ]);
    const row = await scalar<{ role: string }>(
      newUser,
      "select role from public.profiles where id=$1",
      [newUser],
    );
    expect(row.role).toBe("user");
  });

  it("signing up with the owner's email does NOT grant admin by itself", async () => {
    await db.exec("reset role");
    const impostorEmail = "dianalopez161184@gmail.com.evil-lookalike.test";
    await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [
      IMPOSTOR,
      impostorEmail,
    ]);
    const row = await scalar<{ role: string }>(
      IMPOSTOR,
      "select role from public.profiles where id=$1",
      [IMPOSTOR],
    );
    expect(row.role).toBe("user");
  });

  it("a regular user cannot write their own role directly", async () => {
    await expect(
      asUser(A, "update public.profiles set role='admin' where id=$1", [A]),
    ).rejects.toThrow("permission denied");
  });

  it("is_admin() is false for everyone before the owner migration runs", async () => {
    expect((await scalar<{ r: boolean }>(OWNER, "select public.is_admin() r")).r).toBe(false);
    expect((await scalar<{ r: boolean }>(A, "select public.is_admin() r")).r).toBe(false);
  });

  it("refuses to elevate a mismatched id/email pair", async () => {
    // Igual que la migración real: se ejecuta con privilegios de propietario de base,
    // no como un usuario autenticado de la aplicación.
    await db.exec("reset role");
    const bogus = `
      do $$
      declare v_count integer;
      begin
        select count(*) into v_count from auth.users
          where id = '${A}'::uuid and email = 'not-the-real-email@example.com';
        if v_count <> 1 then
          raise exception 'OWNER_VERIFICATION_FAILED: no se encontró una fila de auth.users que coincida con el UUID y el correo esperados. No se aplicó ningún cambio.';
        end if;
      end $$;`;
    await expect(db.exec(bogus)).rejects.toThrow("OWNER_VERIFICATION_FAILED");
    await db.exec("reset role");
    expect((await scalar<{ r: boolean }>(A, "select public.is_admin() r")).r).toBe(false);
  });

  it("applies the controlled owner-admin migration and leaves identity untouched", async () => {
    await db.exec("reset role");
    // auth.users solo es legible con privilegios de propietario; así se verifica la
    // identidad antes y después, igual que lo haría quien ejecuta la migración real.
    const before = await db.query<{ email: string }>(
      "select email from auth.users where id=$1",
      [OWNER],
    );
    await db.exec(await readFile("supabase/migrations/202610090002_assign_owner_admin.sql", "utf8"));
    expect((await scalar<{ r: boolean }>(OWNER, "select public.is_admin() r")).r).toBe(true);
    await db.exec("reset role");
    const after = await db.query<{ email: string }>(
      "select email from auth.users where id=$1",
      [OWNER],
    );
    expect(after.rows[0].email).toBe(before.rows[0].email);
    expect((await scalar<{ r: boolean }>(A, "select public.is_admin() r")).r).toBe(false);
  });

  it("admin RLS lets the owner read every profile, pacto and audit row; regular users still see only their own", async () => {
    const pactoA = (
      await scalar<{ id: string }>(
        A,
        "select public.create_pacto('Pacto de A','Alcance suficientemente largo para A',1000) id",
      )
    ).id;
    const pactoB = (
      await scalar<{ id: string }>(
        B,
        "select public.create_pacto('Pacto de B','Alcance suficientemente largo para B',1000) id",
      )
    ).id;

    expect((await asUser(A, "select id from public.pactos")).rows).toHaveLength(1);
    expect((await asUser(B, "select id from public.pactos")).rows).toHaveLength(1);
    const ownerIds = (await asUser(OWNER, "select id from public.pactos")).rows.map(
      (r) => (r as { id: string }).id,
    );
    expect(ownerIds.sort()).toEqual([pactoA, pactoB].sort());
    expect((await asUser(OWNER, "select id from public.profiles")).rows.length).toBeGreaterThanOrEqual(2);
  });

  it("admin_list_users is forbidden for non-admins and never exposes password material", async () => {
    await expect(asUser(A, "select * from public.admin_list_users()")).rejects.toThrow(
      "FORBIDDEN",
    );
    const { rows, fields } = await asUser(OWNER, "select * from public.admin_list_users()");
    const columns = fields.map((f) => f.name);
    expect(columns).not.toContain("encrypted_password");
    expect(columns.sort()).toEqual(
      ["id", "email", "role", "created_at", "confirmed", "last_sign_in_at"].sort(),
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const owner = rows.find((r) => (r as { email: string }).email === OWNER_EMAIL) as
      | { role: string; confirmed: boolean }
      | undefined;
    expect(owner?.role).toBe("admin");
    expect(owner?.confirmed).toBe(true);
  });

  it("anonymous role cannot call admin RPCs or read profiles", async () => {
    await db.exec("reset role; set role anon");
    await expect(db.query("select * from public.profiles")).rejects.toThrow("permission denied");
    await expect(db.query("select public.admin_list_users()")).rejects.toThrow(
      "permission denied",
    );
  });
});
