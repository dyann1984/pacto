import Link from "next/link";
import { Brand } from "@/components/brand";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { PasswordField } from "@/components/password-field";
import { isConfigured, isGoogleOAuthEnabled } from "@/lib/supabase";
import { safeNextPath } from "@/lib/next-path";
import { resendConfirmation, signIn } from "./actions";

// Sin esto, Next.js puede servir una versión cacheada de la ruta y perder el
// parámetro ?status= tras el redirect de una Server Action (confirmado con E2E real).
export const dynamic = "force-dynamic";

const messages: Record<string, { tone: "info" | "error"; text: string }> = {
  invalid: { tone: "error", text: "No se pudo iniciar sesión. Comprueba tu correo y tu contraseña." },
  unconfirmed: {
    tone: "error",
    text: "Tu cuenta existe pero el correo aún no está confirmado. Revisa tu bandeja o reenvía el correo abajo.",
  },
  "rate-limited": {
    tone: "error",
    text: "Demasiados intentos en poco tiempo. Espera unos minutos e inténtalo de nuevo.",
  },
  failed: {
    tone: "error",
    text: "No se pudo contactar al servidor de autenticación. Intenta de nuevo en unos minutos.",
  },
  "check-email": {
    tone: "info",
    text: "Revisa tu correo y confirma tu cuenta antes de iniciar sesión.",
  },
  resent: {
    tone: "info",
    text: "Si la cuenta existe y falta confirmarla, te enviamos un nuevo correo.",
  },
};

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; next?: string }>;
}) {
  const { status, next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);
  const invited = next.startsWith("/invitacion/");
  const configured = isConfigured();
  const googleEnabled = configured ? await isGoogleOAuthEnabled() : false;
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
            Un acuerdo claro.
            <br />
            <em>Un siguiente paso seguro.</em>
          </h1>
          <p>Alcance, participantes y decisiones en un mismo lugar.</p>
        </div>
      </aside>
      <section className="auth-form">
        <Link className="back-link" href="/">
          ← Volver al inicio
        </Link>
        <span className="eyebrow">BIENVENIDO A PACTO</span>
        <h2>Iniciar sesión</h2>
        <p>
          {invited
            ? "Entra con tu cuenta para ver la invitación y unirte al Pacto."
            : "Accede a los acuerdos en los que participas."}
        </p>
        {!configured ? (
          <div className="notice" role="status">
            <strong>Acceso no disponible por ahora</strong>
            <p>Inténtalo de nuevo en unos minutos.</p>
          </div>
        ) : message ? (
          <div
            className={message.tone === "error" ? "notice" : "notice notice-info"}
            role={message.tone === "error" ? "alert" : "status"}
          >
            {message.text}
          </div>
        ) : null}
        <GoogleAuthButton next={next} enabled={googleEnabled} />
        <p className="fine-print" style={{ textAlign: "center" }}>
          o con tu correo
        </p>
        <form action={signIn}>
          <input type="hidden" name="next" value={next} />
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
          <PasswordField
            name="password"
            label="Contraseña"
            autoComplete="current-password"
            minLength={8}
            maxLength={128}
          />
          <button className="button" disabled={!configured}>
            Entrar a mis Pactos →
          </button>
          {invited && (
            <p className="fine-print">
              ¿No tienes cuenta?{" "}
              <Link href={`/demo?next=${encodeURIComponent(next)}`}>
                Continúa como visitante DEMO
              </Link>
              .
            </p>
          )}
        </form>
        {status === "unconfirmed" && (
          <details className="revision" open>
            <summary>Reenviar correo de confirmación</summary>
            <form action={resendConfirmation}>
              <label>
                Correo electrónico
                <input name="email" type="email" autoComplete="username" required />
              </label>
              <button className="button button-light">Reenviar correo</button>
            </form>
          </details>
        )}
        <p className="fine-print">
          <Link href="/forgot-password">¿Olvidaste tu contraseña?</Link>
        </p>
        <p className="fine-print">
          ¿No tienes cuenta? <Link href="/sign-up">Regístrate</Link>
        </p>
      </section>
    </main>
  );
}
