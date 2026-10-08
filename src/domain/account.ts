import { z } from "zod";

export const signUpSchema = z
  .object({
    email: z.email(),
    password: z.string().min(8).max(128),
    passwordConfirm: z.string().min(8).max(128),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: "PASSWORD_MISMATCH",
    path: ["passwordConfirm"],
  });

export const emailOnlySchema = z.object({ email: z.email() });

export const newPasswordSchema = z
  .object({
    password: z.string().min(8).max(128),
    passwordConfirm: z.string().min(8).max(128),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: "PASSWORD_MISMATCH",
    path: ["passwordConfirm"],
  });
