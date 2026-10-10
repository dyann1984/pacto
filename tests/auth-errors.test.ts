import { describe, expect, it } from "vitest";
import { isRateLimited } from "@/lib/auth-errors";

// Las dos puertas de entrada sin credenciales —/demo y el Modo Juez— dependen de
// distinguir "espera un rato" de "algo está roto". Si esta regla se equivoca,
// quien evalúa PACTO concluye que no funciona cuando solo había que esperar.

describe("isRateLimited", () => {
  it("reconoce el 429 de Supabase", () => {
    expect(isRateLimited({ status: 429 })).toBe(true);
  });

  it("reconoce el código over_request_rate_limit aunque el estado sea otro", () => {
    expect(isRateLimited({ status: 400, code: "over_request_rate_limit" })).toBe(true);
  });

  it("no confunde otros fallos de autenticación con el límite", () => {
    expect(isRateLimited({ status: 400, code: "invalid_credentials" })).toBe(false);
    expect(isRateLimited({ status: 500 })).toBe(false);
    expect(isRateLimited({ status: 403, code: "anonymous_provider_disabled" })).toBe(false);
  });

  it("trata la ausencia de error como ausencia de límite", () => {
    expect(isRateLimited(null)).toBe(false);
    expect(isRateLimited(undefined)).toBe(false);
  });
});
