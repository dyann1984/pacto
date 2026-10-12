import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

/**
 * Cupo de análisis con IA (202610160001_ai_quota.sql). La función solo devuelve dos
 * recuentos: los míos en 24 h y los de todos en 1 h. Nunca filas ni identidades ajenas.
 */

const A = "11111111-1111-4111-8111-111111111111",
  B = "33333333-3333-4333-8333-333333333333";

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
  "supabase/migrations/202610160001_ai_quota.sql",
];

let db: PGlite;

async function asUser(id: string, query: string, params: unknown[] = []) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
  try {
    return await db.query(query, params);
  } finally {
    await db.exec("reset role");
  }
}

async function quota(id: string) {
  const { rows } = await asUser(id, "select mine_24h, all_1h from public.ai_quota()");
  return rows[0] as { mine_24h: number; all_1h: number };
}

/** Un Pacto propio y su análisis, registrado como lo hace la aplicación. */
async function analyze(id: string, at = "now()") {
  const p = ((await asUser(id, "select public.create_pacto('Cupo IA','Alcance para probar el cupo de análisis',100000) id")).rows[0] as {
    id: string;
  }).id;
  const a = ((await asUser(id, "select id from public.agreements where pacto_id=$1", [p])).rows[0] as { id: string }).id;
  await asUser(id, "select public.record_ai_analysis($1,'claude-sonnet-5-5',repeat('a',64),$2::jsonb)", [
    a,
    JSON.stringify({ summary: "s", findings: [], limitations: "l" }),
  ]);
  if (at !== "now()") await db.query(`update public.ai_analyses set created_at=${at} where agreement_id=$1`, [a]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key, email text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to authenticated,anon,service_role; grant execute on function auth.uid() to authenticated,anon,service_role;",
  );
  await db.query("insert into auth.users(id,email) values($1,'a@example.com'),($2,'b@example.com')", [A, B]);
  for (const file of MIGRATIONS) await db.exec(await readFile(file, "utf8"));
}, 30000);

afterAll(async () => {
  await db.close();
});

describe.sequential("cupo de análisis con IA", () => {
  it("cuenta lo mío en 24 h y lo de todos en la última hora", async () => {
    expect(await quota(A)).toEqual({ mine_24h: 0, all_1h: 0 });
    await analyze(A);
    await analyze(A);
    await analyze(B);
    expect(await quota(A)).toEqual({ mine_24h: 2, all_1h: 3 });
    expect(await quota(B)).toEqual({ mine_24h: 1, all_1h: 3 });
  });

  it("las ventanas de tiempo se respetan", async () => {
    await analyze(A, "now() - interval '2 hours'"); // cuenta en mis 24 h, no en la hora global
    await analyze(A, "now() - interval '25 hours'"); // fuera de ambas ventanas
    expect(await quota(A)).toEqual({ mine_24h: 3, all_1h: 3 });
  });

  it("no revela análisis ajenos: B sigue sin poder leer las filas de A", async () => {
    const { rows } = await asUser(B, "select count(*)::int n from public.ai_analyses where requested_by=$1", [A]);
    expect((rows[0] as { n: number }).n).toBe(0);
  });

  it("anon no puede consultarla", async () => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    await db.exec("set role anon");
    await expect(db.query("select * from public.ai_quota()")).rejects.toThrow("permission denied");
    await db.exec("reset role");
  });

  it("es segura ante reintentos", async () => {
    await expect(db.exec(await readFile("supabase/migrations/202610160001_ai_quota.sql", "utf8"))).rejects.toThrow(
      "MIGRATION_ALREADY_APPLIED",
    );
  });
});
