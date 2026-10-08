import Link from "next/link";
import { Brand } from "@/components/brand";
import { isConfigured } from "@/lib/supabase";
import { requestPasswordReset } from "./actions";

export default async function ForgotPassword({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const configured = isConfigured();
  return (
    <main className="auth-layout">
      <aside className="auth-brand">
        <Link href="/">
          <Brand />
        </Link>
        <div>
          <span className="eyebrow">AI COMMERCE. REAL RESULTS.</span>
          <h1>
            ¿Olvidaste tu contraseña?
            <br />
            <em>Te enviamos un enlace.</em>
          </h1>
        </div>
        <span className="fine-print">PACTO</span>
      </aside>
      <section className="auth-form">
        <Link className="back-link" href="/sign-in">
          ← Volver a iniciar sesión
        </Link>
        <span className="eyebrow">RECUPERAR CONTRASEÑA</span>
        <h2>Recuperar acceso</h2>
        <p>Escribe tu correo y te enviaremos un enlace para elegir una contraseña nueva.</p>
        {!configured ? (
          <div className="notice" role="status">
            <strong>Configuración pendiente</strong>
            <p>Conecta Supabase para habilitar la recuperación.</p>
          </div>
        ) : status === "sent" ? (
          <div className="notice notice-info" role="status">
            Si existe una cuenta con ese correo, recibirás un enlace para
            restablecer tu contraseña en unos minutos.
          </div>
        ) : status === "invalid" ? (
          <div className="notice" role="alert">
            Escribe un correo válido.
          </div>
        ) : null}
        <form action={requestPasswordReset}>
          <label>
            Correo electrónico
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              placeholder="tu@empresa.com"
            />
          </label>
          <button className="button" disabled={!configured}>
            Enviar enlace →
          </button>
        </form>
      </section>
    </main>
  );
}
