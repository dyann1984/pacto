import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

async function withEnv<T>(env: Record<string, string>, fn: () => Promise<T>) {
  Object.assign(process.env, env);
  try {
    return await fn();
  } finally {
    process.env = { ...originalEnv };
  }
}

describe("isGoogleOAuthEnabled", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it("returns false without Supabase configuration (fails closed)", async () => {
    const { isGoogleOAuthEnabled } = await import("@/lib/supabase");
    await withEnv(
      { NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" },
      async () => {
        expect(await isGoogleOAuthEnabled()).toBe(false);
      },
    );
  });

  it("returns true only when Supabase reports Google enabled", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ external: { google: true } }), { status: 200 }),
    ) as unknown as typeof fetch;
    await withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      },
      async () => {
        const { isGoogleOAuthEnabled } = await import("@/lib/supabase");
        expect(await isGoogleOAuthEnabled()).toBe(true);
      },
    );
  });

  it("returns false when Google is disabled in the project", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ external: { google: false } }), { status: 200 }),
    ) as unknown as typeof fetch;
    await withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      },
      async () => {
        const { isGoogleOAuthEnabled } = await import("@/lib/supabase");
        expect(await isGoogleOAuthEnabled()).toBe(false);
      },
    );
  });

  it("fails closed on a network error or non-200 response", async () => {
    global.fetch = vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    await withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      },
      async () => {
        const { isGoogleOAuthEnabled } = await import("@/lib/supabase");
        expect(await isGoogleOAuthEnabled()).toBe(false);
      },
    );
    global.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      },
      async () => {
        const { isGoogleOAuthEnabled } = await import("@/lib/supabase");
        expect(await isGoogleOAuthEnabled()).toBe(false);
      },
    );
  });

  it("never sends the publishable key as anything but the apikey header value", async () => {
    let capturedHeaders: HeadersInit | undefined;
    global.fetch = vi.fn(async (_url, init?: RequestInit) => {
      capturedHeaders = init?.headers;
      return new Response(JSON.stringify({ external: { google: false } }), { status: 200 });
    }) as unknown as typeof fetch;
    await withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      },
      async () => {
        const { isGoogleOAuthEnabled } = await import("@/lib/supabase");
        await isGoogleOAuthEnabled();
      },
    );
    expect((capturedHeaders as Record<string, string>)?.apikey).toBe("sb_publishable_test");
  });
});
