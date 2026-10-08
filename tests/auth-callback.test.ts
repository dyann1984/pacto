import { beforeEach, describe, it, expect, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  configured: true,
  exchangeError: null as { message: string } | null,
}));
vi.mock("@/lib/supabase", () => ({
  isConfigured: () => mocked.configured,
  supabase: async () => ({
    auth: {
      exchangeCodeForSession: async () => ({ error: mocked.exchangeError }),
    },
  }),
}));
import { GET } from "../src/app/auth/callback/route";

const get = (query: string) => GET(new Request(`http://localhost/auth/callback${query}`));

beforeEach(() => {
  mocked.configured = true;
  mocked.exchangeError = null;
});

describe("/auth/callback", () => {
  it("exchanges a valid code and redirects to the requested internal path", async () => {
    const response = await get("?code=valid&next=/admin");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/admin");
  });

  it("defaults to /pactos when no next is given", async () => {
    const response = await get("?code=valid");
    expect(response.headers.get("location")).toBe("http://localhost/pactos");
  });

  it("refuses an absolute or protocol-relative next (open-redirect guard)", async () => {
    expect((await get("?code=valid&next=https://evil.example.com")).headers.get("location")).toBe(
      "http://localhost/pactos",
    );
    expect((await get("?code=valid&next=//evil.example.com")).headers.get("location")).toBe(
      "http://localhost/pactos",
    );
  });

  it("sends to sign-in with an error status when the exchange fails", async () => {
    mocked.exchangeError = { message: "invalid grant" };
    const response = await get("?code=bad");
    expect(response.headers.get("location")).toBe("http://localhost/sign-in?status=invalid");
  });

  it("sends to sign-in with an error status when there is no code", async () => {
    const response = await get("");
    expect(response.headers.get("location")).toBe("http://localhost/sign-in?status=invalid");
  });

  it("fails closed without Supabase configuration", async () => {
    mocked.configured = false;
    const response = await get("?code=valid");
    expect(response.headers.get("location")).toBe("http://localhost/sign-in?status=invalid");
  });
});
