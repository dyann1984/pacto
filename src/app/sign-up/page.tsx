import Link from "next/link";
import { Brand } from "@/components/brand";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { PasswordField } from "@/components/password-field";
import { isConfigured, isGoogleOAuthEnabled } from "@/lib/supabase";
import { signUp } from "./actions";

export const dynamic = "force-dynamic";

const messages: Record<string, { tone: "info" | "error"; text: string }> = {
  invalid: { tone: "error", text: "Revisa el correo y la contraseña (mínimo 8 caracteres)." },
  mismatch: { tone: "error", text: "Las contraseñas no coinciden." },
  exists: {
    tone: "error",
    text: "Ya existe una cuenta con ese correo. Intenta iniciar sesión o recuperar tu contraseña.",
  },
  // No es una avería, y la salida está en la propia pantalla: la DEMO no manda
  // ningún correo, así que quien solo quiere ver PACTO no tiene que esperar.
  "email-rate-limit": {
    tone: "info",
    text: "Se alcanzó el límite de correos de confirmación de esta hora, así que no podemos enviarte el tuyo ahora mismo. Tu cuenta no se ha creado: vuelve a intentarlo en unos minutos. Si solo quieres probar PACTO, «Explorar DEMO» entra sin correo ni contraseña.",
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
            <strong>Registro no disponible por ahora</strong>
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
        <GoogleAuthButton next="/pactos" enabled={googleEnabled} />
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
          <PasswordField
            name="password"
            label="Contraseña"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
          />
          <p className="fine-print">Mínimo 8 caracteres.</p>
          <PasswordField
            name="passwordConfirm"
            label="Confirmar contraseña"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
          />
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
