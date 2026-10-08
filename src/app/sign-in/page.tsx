import Link from "next/link";
import { Brand } from "@/components/brand";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { isConfigured } from "@/lib/supabase";
import { signIn } from "./actions";
export default async function SignIn({
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
            Un acuerdo claro.
            <br />
            <em>Un siguiente paso seguro.</em>
          </h1>
          <p>Alcance, participantes y decisiones en un mismo lugar.</p>
        </div>
        <span className="fine-print">PACTO · FOUNDATION</span>
      </aside>
      <section className="auth-form">
        <Link className="back-link" href="/">
          ← Volver al inicio
        </Link>
        <span className="eyebrow">BIENVENIDO A PACTO</span>
        <h2>Iniciar sesión</h2>
        <p>Accede a los acuerdos en los que participas.</p>
        {!configured ? (
          <div className="notice" role="status">
            <strong>Configuración pendiente</strong>
            <p>
              Conecta Supabase y aplica las migraciones para habilitar el
              acceso. No se ha creado una sesión DEMO.
            </p>
          </div>
        ) : status === "invalid" ? (
          <div className="notice" role="alert">
            No se pudo iniciar sesión. Comprueba tus credenciales.
          </div>
        ) : status === "check-email" ? (
          <div className="notice notice-info" role="status">
            Revisa tu correo y confirma tu cuenta antes de iniciar sesión.
          </div>
        ) : null}
        <GoogleAuthButton next="/pactos" />
        <p className="fine-print" style={{ textAlign: "center" }}>
          o con tu correo
        </p>
        <form action={signIn}>
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
              autoComplete="current-password"
              minLength={8}
              maxLength={128}
              required
            />
          </label>
          <button className="button" disabled={!configured}>
            Entrar a mis Pactos →
          </button>
        </form>
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
