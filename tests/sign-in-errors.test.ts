import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  configured: true,
  error: null as { code?: string; status?: number; message: string } | null,
}));
vi.mock("@/lib/supabase", () => ({
  isConfigured: () => mocked.configured,
  supabase: async () => ({
    auth: {
      signInWithPassword: async () => ({ error: mocked.error }),
      resend: async () => ({ error: null }),
    },
  }),
}));
vi.mock("@/lib/origin", () => ({ requestOrigin: async () => "http://localhost:3000" }));
import { signIn } from "../src/app/sign-in/actions";

function redirectTarget(err: unknown): string {
  // next/navigation's redirect() throws; the thrown error's digest encodes the path.
  const digest = (err as { digest?: string })?.digest ?? "";
  const match = digest.match(/;(\/[^;]*);/);
  if (match) return match[1];
  throw err;
}

async function submit(email: string, password: string) {
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  try {
    await signIn(form);
  } catch (err) {
    return redirectTarget(err);
  }
  throw new Error("signIn did not redirect");
}

beforeEach(() => {
  mocked.configured = true;
  mocked.error = null;
});

describe("signIn error differentiation", () => {
  it("redirects to /pactos on success", async () => {
    expect(await submit("a@example.com", "password1")).toBe("/pactos");
  });

  it("maps invalid_credentials to a generic, non-enumerating status", async () => {
    mocked.error = { code: "invalid_credentials", message: "Invalid login credentials" };
    expect(await submit("a@example.com", "wrongpass")).toBe("/sign-in?status=invalid");
  });

  it("distinguishes an unconfirmed email instead of calling it invalid", async () => {
    mocked.error = { code: "email_not_confirmed", message: "Email not confirmed" };
    expect(await submit("a@example.com", "password1")).toBe("/sign-in?status=unconfirmed");
  });

  it("distinguishes rate limiting from invalid credentials", async () => {
    mocked.error = { status: 429, message: "Too many requests" };
    expect(await submit("a@example.com", "password1")).toBe("/sign-in?status=rate-limited");
  });

  it("falls back to a server-failure status for unrecognized errors", async () => {
    mocked.error = { code: "unexpected_failure", message: "boom" };
    expect(await submit("a@example.com", "password1")).toBe("/sign-in?status=failed");
  });

  it("rejects malformed input before contacting Supabase", async () => {
    expect(await submit("not-an-email", "password1")).toBe("/sign-in?status=invalid");
  });

  it("fails closed when Supabase is not configured", async () => {
    mocked.configured = false;
    expect(await submit("a@example.com", "password1")).toBe("/sign-in?status=configuration");
  });
});
