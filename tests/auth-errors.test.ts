import { describe, expect, it } from "vitest";
import { isEmailRateLimited, isRateLimited } from "@/lib/auth-errors";

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

// Comprobado contra el proyecto Supabase real el 10 oct 2026: registrarse con el
// cupo de correo agotado devuelve 429 / over_email_send_rate_limit y la cuenta
// NO llega a crearse (un signInWithPassword posterior da invalid_credentials,
// no email_not_confirmed). De ahí que el mensaje pueda decirlo sin rodeos.
describe("isEmailRateLimited", () => {
  it("reconoce el cupo de correo agotado", () => {
    expect(isEmailRateLimited({ status: 429, code: "over_email_send_rate_limit" })).toBe(true);
  });

  it("no lo confunde con el límite general de peticiones", () => {
    expect(isEmailRateLimited({ status: 429, code: "over_request_rate_limit" })).toBe(false);
    expect(isEmailRateLimited({ status: 429 })).toBe(false);
  });

  it("no lo confunde con otros fallos del registro", () => {
    expect(isEmailRateLimited({ status: 422, code: "user_already_exists" })).toBe(false);
    expect(isEmailRateLimited(null)).toBe(false);
  });
});
