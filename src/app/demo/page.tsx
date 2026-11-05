"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { safeNextPath } from "@/lib/next-path";
import { isRateLimited } from "@/lib/auth-errors";

// Punto de entrada del modo DEMO: crea una sesión anónima real de Supabase
// (auth.signInWithAnonymous) si el visitante no tiene ninguna, y lo envía a la
// aplicación real. Sin correo, sin contraseña, sin service_role en el navegador.
// El aislamiento entre visitantes lo da RLS, exactamente igual que a cualquier
// usuario real: cada sesión anónima tiene su propio auth.uid() único.
export default function Demo() {
  const router = useRouter();
  const [error, setError] = useState<null | "rate-limited" | "unavailable">(null);

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
          // Agotar el cupo horario de sesiones anónimas no es una avería, y
          // confundirlo con una deja a quien evalúa sin saber que basta esperar.
          if (!cancelled) setError(isRateLimited(anonError) ? "rate-limited" : "unavailable");
          return;
        }
      }
      // Permite volver, por ejemplo, al enlace de invitación que trajo al visitante.
      const next = safeNextPath(new URLSearchParams(window.location.search).get("next"));
      if (!cancelled) router.replace(next);
    }
    enterDemo();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="auth-layout">
      <section className="auth-form" style={{ margin: "auto", textAlign: "center" }}>
        {error === "rate-limited" && (
          <div className="notice" role="alert">
            <strong>Demasiadas sesiones de prueba en la última hora</strong>
            <p>
              PACTO limita cuántas sesiones anónimas se crean por hora y por
              dirección IP, para evitar abusos. No es un fallo: espera unos
              minutos y vuelve a intentarlo, o{" "}
              <a href="/sign-in">inicia sesión con una cuenta</a>.
            </p>
          </div>
        )}
        {error === "unavailable" && (
          <div className="notice" role="alert">
            <strong>Modo DEMO no disponible por ahora</strong>
            <p>
              Intenta de nuevo en unos minutos, o{" "}
              <a href="/sign-in">inicia sesión con una cuenta</a>.
            </p>
          </div>
        )}
        {!error && <p>Preparando tu sesión de demostración…</p>}
      </section>
    </main>
  );
}
