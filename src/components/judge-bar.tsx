"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { exitJudgeMode, switchRole, useJudgeRole } from "@/lib/judge-session";

/**
 * Barra del Modo Juez: dice quién eres ahora mismo, qué te toca hacer y te deja
 * pasar a la otra parte. El cambio de rol activa la otra sesión DEMO real; el
 * servidor no sabe que existe un "modo juez" y no relaja ninguna comprobación.
 */
export function JudgeBar({ hint }: { hint?: string }) {
  const router = useRouter();
  // El estado vive en el navegador; en el servidor es null, así que la barra
  // no se renderiza allí y no hay desajuste de hidratación.
  const acting = useJudgeRole();
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!acting) return null;

  const other = acting === "BUYER" ? "proveedor" : "cliente";

  async function swap() {
    setFailed(false);
    try {
      await switchRole();
      startTransition(() => router.refresh());
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="judge-bar" role="region" aria-label="Modo Juez">
      <div className="judge-bar-main">
        <span className="badge badge-dark">MODO JUEZ</span>
        <span className="judge-identity">
          Actúas como <strong>{acting === "BUYER" ? "cliente" : "proveedor"}</strong>
        </span>
        {hint && <span className="judge-hint">{hint}</span>}
      </div>
      <div className="judge-bar-actions">
        <button type="button" className="button button-light" onClick={swap} disabled={pending}>
          {pending ? "Cambiando…" : `Actuar como ${other} ⇄`}
        </button>
        <Link
          className="text-button"
          href="/juez"
          onClick={() => exitJudgeMode()}
        >
          Reiniciar demostración
        </Link>
      </div>
      {failed && (
        <div className="notice" role="alert">
          No se pudo cambiar de parte. Recarga la página e inténtalo de nuevo.
        </div>
      )}
    </div>
  );
}
