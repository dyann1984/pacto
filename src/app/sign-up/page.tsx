import Link from "next/link";
import { Brand } from "@/components/brand";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { isConfigured } from "@/lib/supabase";
import { signUp } from "./actions";

const messages: Record<string, { tone: "info" | "error"; text: string }> = {
  invalid: { tone: "error", text: "Revisa el correo y la contraseña (mínimo 8 caracteres)." },
  mismatch: { tone: "error", text: "Las contraseñas no coinciden." },
  exists: {
    tone: "error",
    text: "Ya existe una cuenta con ese correo. Intenta iniciar sesión o recuperar tu contraseña.",
  },
  failed: { tone: "error", text: "No se pudo completar el registro. Intenta de nuevo." },
};

export default async function SignUp({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const configured = isConfigured();
  const message = status ? messages[status] : undefined;
  return (
    <main className="auth-layout">
      <aside className="auth-brand">
        <Link href="/">
          <Brand />
        </Link>
        <div>
          <span className="eyebrow">AI COMMERCE. REAL RESULTS.</span>
          <h1>
            Crea tu cuenta.
            <br />
            <em>Empieza tu primer Pacto.</em>
          </h1>
          <p>Registro con correo o con Google. Tu rol inicial es siempre de usuario.</p>
        </div>
        <span className="fine-print">PACTO</span>
      </aside>
      <section className="auth-form">
        <Link className="back-link" href="/">
          ← Volver al inicio
        </Link>
        <span className="eyebrow">CREAR CUENTA</span>
        <h2>Registrarme</h2>
        <p>Recibirás un correo para confirmar tu dirección.</p>
        {!configured ? (
          <div className="notice" role="status">
            <strong>Configuración pendiente</strong>
            <p>Conecta Supabase para habilitar el registro.</p>
          </div>
        ) : message ? (
          <div
            className={message.tone === "error" ? "notice" : "notice notice-info"}
            role={message.tone === "error" ? "alert" : "status"}
          >
            {message.text}
          </div>
        ) : null}
        <GoogleAuthButton next="/pactos" />
        <p className="fine-print" style={{ textAlign: "center" }}>
          o con tu correo
        </p>
        <form action={signUp}>
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
          <label>
            Contraseña
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
          </label>
          <label>
            Confirmar contraseña
            <input
              name="passwordConfirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
          </label>
          <button className="button" disabled={!configured}>
            Crear mi cuenta →
          </button>
        </form>
        <p className="fine-print">
          ¿Ya tienes cuenta? <Link href="/sign-in">Inicia sesión</Link>
        </p>
      </section>
    </main>
  );
}
