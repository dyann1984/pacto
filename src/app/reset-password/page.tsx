import Link from "next/link";
import { Brand } from "@/components/brand";
import { PasswordField } from "@/components/password-field";
import { supabase, isConfigured } from "@/lib/supabase";
import { updatePassword } from "./actions";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  mismatch: "Las contraseñas no coinciden.",
  invalid: "La contraseña debe tener al menos 8 caracteres.",
  failed: "No se pudo actualizar la contraseña. Solicita un nuevo enlace e intenta de nuevo.",
};

export default async function ResetPassword({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const configured = isConfigured();
  let hasSession = false;
  if (configured) {
    const db = await supabase();
    const {
      data: { user },
    } = await db.auth.getUser();
    hasSession = Boolean(user);
  }
  return (
    <main className="auth-layout">
      <aside className="auth-brand">
        <Link href="/">
          <Brand />
        </Link>
        <div>
          <span className="eyebrow">AI COMMERCE. REAL RESULTS.</span>
          <h1>
            Elige una contraseña
            <br />
            <em>nueva y segura.</em>
          </h1>
        </div>
        <span className="fine-print">PACTO</span>
      </aside>
      <section className="auth-form">
        <span className="eyebrow">RESTABLECER CONTRASEÑA</span>
        <h2>Nueva contraseña</h2>
        {!configured ? (
          <div className="notice" role="status">
            <strong>Configuración pendiente</strong>
            <p>Conecta Supabase para habilitar la recuperación.</p>
          </div>
        ) : !hasSession ? (
          <div className="notice" role="alert">
            <strong>Enlace inválido o expirado</strong>
            <p>
              Solicita un nuevo enlace desde{" "}
              <Link href="/forgot-password">recuperar contraseña</Link>.
            </p>
          </div>
        ) : status && messages[status] ? (
          <div className="notice" role="alert">
            {messages[status]}
          </div>
        ) : null}
        {hasSession && (
          <form action={updatePassword}>
            <PasswordField
              name="password"
              label="Nueva contraseña"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
            />
            <PasswordField
              name="passwordConfirm"
              label="Confirmar contraseña"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
            />
            <button className="button">Guardar contraseña →</button>
          </form>
        )}
      </section>
    </main>
  );
}
