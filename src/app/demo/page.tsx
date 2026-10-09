"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

// Punto de entrada del modo DEMO: crea una sesión anónima real de Supabase
// (auth.signInWithAnonymous) si el visitante no tiene ninguna, y lo envía a la
// aplicación real. Sin correo, sin contraseña, sin service_role en el navegador.
// El aislamiento entre visitantes lo da RLS, exactamente igual que a cualquier
// usuario real: cada sesión anónima tiene su propio auth.uid() único.
export default function Demo() {
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function enterDemo() {
      const db = supabaseBrowser();
      const {
        data: { session },
      } = await db.auth.getSession();
      if (!session) {
        const { error: anonError } = await db.auth.signInAnonymously();
        if (anonError) {
          if (!cancelled) setError(true);
          return;
        }
      }
      if (!cancelled) router.replace("/pactos");
    }
    enterDemo();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="auth-layout">
      <section className="auth-form" style={{ margin: "auto", textAlign: "center" }}>
        {error ? (
          <div className="notice" role="alert">
            <strong>Modo DEMO no disponible por ahora</strong>
            <p>
              Intenta de nuevo en unos minutos, o{" "}
              <a href="/sign-in">inicia sesión con una cuenta</a>.
            </p>
          </div>
        ) : (
          <p>Preparando tu sesión de demostración…</p>
        )}
      </section>
    </main>
  );
}
