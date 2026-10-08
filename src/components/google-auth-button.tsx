"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export function GoogleAuthButton({ next = "/pactos" }: { next?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

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
