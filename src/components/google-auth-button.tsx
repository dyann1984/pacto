"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export function GoogleAuthButton({
  next = "/pactos",
  enabled,
}: {
  next?: string;
  // true/false: estado real verificado en el servidor. undefined: aún no se pudo
  // verificar (se trata igual que deshabilitado; nunca se asume disponible).
  enabled: boolean | undefined;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  if (!enabled) {
    return (
      <>
        <button type="button" className="button button-light" disabled aria-disabled="true">
          Continuar con Google
        </button>
        <p className="fine-print">Disponible próximamente.</p>
      </>
    );
  }

  async function handleClick() {
    setPending(true);
    setError(false);
    const db = supabaseBrowser();
    const { error: oauthError } = await db.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (oauthError) {
      setError(true);
      setPending(false);
    }
    // En éxito, Supabase redirige de inmediato a Google; no hay más que hacer aquí.
  }

  return (
    <>
      <button
        type="button"
        className="button button-light"
        onClick={handleClick}
        disabled={pending}
      >
        {pending ? "Redirigiendo a Google…" : "Continuar con Google"}
      </button>
      {error && (
        <p className="fine-print" role="alert">
          No se pudo iniciar el acceso con Google. Intenta de nuevo.
        </p>
      )}
    </>
  );
}
