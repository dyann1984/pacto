"use client";
import { useJudgeRole } from "@/lib/judge-session";

const labels = { BUYER: "cliente", SELLER: "proveedor" } as const;

/**
 * Aviso del Modo Juez: aparece solo cuando el paso pendiente le toca a la otra
 * parte, para que el evaluador sepa que debe cambiar de identidad arriba.
 * Fuera del Modo Juez no se muestra nada.
 */
export function JudgeRoleNote({ role }: { role: "BUYER" | "SELLER" }) {
  const acting = useJudgeRole();
  if (!acting || acting === role) return null;

  return (
    <p className="judge-note" role="status">
      <strong>Modo Juez:</strong> este paso le toca al {labels[role]}. Pulsa{" "}
      «Actuar como {labels[role]}» en la barra superior y vuelve aquí.
    </p>
  );
}
