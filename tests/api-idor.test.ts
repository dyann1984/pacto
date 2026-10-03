import { beforeEach, describe, it, expect, vi } from "vitest";
const mocked = vi.hoisted(() => ({
  configured: true,
  userId: "buyerA" as string | null,
}));
vi.mock("@/lib/supabase", () => ({
  isConfigured: () => mocked.configured,
  supabase: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: mocked.userId ? { id: mocked.userId } : null },
        error: null,
      }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: (_key: string, id: string) =>
          table === "participants"
            ? Promise.resolve({
                data:
                  id === "11111111-1111-4111-8111-111111111111"
                    ? [{ pacto_id: id, user_id: "buyerA", role: "BUYER" }]
                    : [{ pacto_id: id, user_id: "buyerB", role: "BUYER" }],
                error: null,
              })
            : {
                maybeSingle: async () => ({
                  data: { id, title: "Pacto autorizado", environment: "DEMO" },
                  error: null,
                }),
              },
      }),
    }),
  }),
}));
import { GET } from "../src/app/api/pactos/[id]/route";
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
const get = (id: string) =>
  GET(new Request(`http://localhost/api/pactos/${id}`), {
    params: Promise.resolve({ id }),
  });
beforeEach(() => {
  mocked.configured = true;
  mocked.userId = "buyerA";
});
describe("HTTP handler IDOR boundary (mocked identity provider)", () => {
  it("returns own Pacto with private no-store caching", async () => {
    const response = await get(A);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).id).toBe(A);
  });
  it("returns 404 for an unrelated ID rather than exposing B", async () => {
    const response = await get(B);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "NOT_FOUND" });
  });
  it("does not let buyer B read A", async () => {
    mocked.userId = "buyerB";
    expect((await get(A)).status).toBe(404);
    expect((await get(B)).status).toBe(200);
  });
  it("requires authenticated identity", async () => {
    mocked.userId = null;
    expect((await get(A)).status).toBe(401);
  });
  it("fails closed without configuration and validates IDs", async () => {
    expect((await get("invalid")).status).toBe(404);
    mocked.configured = false;
    expect((await get(A)).status).toBe(503);
  });
});
