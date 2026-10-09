import { describe, expect, it } from "vitest";
import { emailOnlySchema, newPasswordSchema, signUpSchema } from "@/domain/account";

describe("signUpSchema", () => {
  it("accepts a matching email and password pair", () => {
    const r = signUpSchema.safeParse({
      email: "a@example.com",
      password: "password1",
      passwordConfirm: "password1",
    });
    expect(r.success).toBe(true);
  });

  it("rejects mismatched passwords with a dedicated message", () => {
    const r = signUpSchema.safeParse({
      email: "a@example.com",
      password: "password1",
      passwordConfirm: "password2",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === "PASSWORD_MISMATCH")).toBe(true);
    }
  });

  it("rejects an invalid email", () => {
    expect(
      signUpSchema.safeParse({
        email: "not-an-email",
        password: "password1",
        passwordConfirm: "password1",
      }).success,
    ).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(
      signUpSchema.safeParse({
        email: "a@example.com",
        password: "short",
        passwordConfirm: "short",
      }).success,
    ).toBe(false);
  });
});

describe("emailOnlySchema", () => {
  it("accepts a valid email and rejects an invalid one", () => {
    expect(emailOnlySchema.safeParse({ email: "a@example.com" }).success).toBe(true);
    expect(emailOnlySchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

describe("newPasswordSchema", () => {
  it("requires matching passwords of sufficient length", () => {
    expect(
      newPasswordSchema.safeParse({ password: "newpass1", passwordConfirm: "newpass1" }).success,
    ).toBe(true);
    expect(
      newPasswordSchema.safeParse({ password: "newpass1", passwordConfirm: "other" }).success,
    ).toBe(false);
  });
});
