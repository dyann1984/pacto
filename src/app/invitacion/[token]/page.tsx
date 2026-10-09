import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { isConfigured, supabase } from "@/lib/supabase";
import { acceptInvitation } from "@/app/pactos/actions";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

type Preview = {
  status:
    | "OPEN"
    | "JOINED"
    | "OWN"
    | "USED"
    | "EXPIRED"
    | "INACTIVE"
    | "EMAIL_MISMATCH"
    | "NOT_FOUND";
  pacto_id?: string;
  title?: string;
  scope?: string;
  total_cents?: number;
  email_restricted?: boolean;
};

const closedMessages: Record<string, { title: string; text: string }> = {
  USED: {
    title: "Esta invitación ya se utilizó",
    text: "Otra persona la aceptó o el comprador generó un enlace nuevo. Pídele que te envíe la invitación vigente.",
  },
  EXPIRED: {
    title: "Esta invitación caducó",
    text: "Los enlaces de invitación son válidos durante 7 días. Pide al comprador que genere uno nuevo.",
  },
  INACTIVE: {
    title: "Este Pacto ya no está activo",
    text: "El acuerdo se cerró o se canceló, por lo que ya no admite nuevos participantes.",
  },
  EMAIL_MISMATCH: {
    title: "Esta invitación es para otra cuenta",
    text: "Quien te invitó la reservó para una dirección de correo concreta. Inicia sesión con esa cuenta y vuelve a abrir el enlace.",
  },
  NOT_FOUND: {
    title: "No encontramos esta invitación",
    text: "Revisa que el enlace esté completo. Si lo copiaste de un correo, puede haberse cortado.",
  },
  UNAVAILABLE: {
    title: "Invitaciones no disponibles por ahora",
    text: "Intenta abrir el enlace de nuevo en unos minutos.",
  },
};

const errorMessages: Record<string, string> = {
  INVITATION_USED: "La invitación ya se utilizó. Pide al comprador un enlace nuevo.",
  INVITATION_EXPIRED: "La invitación caducó. Pide al comprador un enlace nuevo.",
  INVITATION_EMAIL_MISMATCH:
    "Esta invitación es para otro correo. Inicia sesión con la cuenta a la que te invitaron.",
  DISTINCT_PARTIES_REQUIRED:
    "Ya participas en este Pacto. Comparte el enlace con tu proveedor en lugar de abrirlo tú.",
  SELLER_ALREADY_JOINED: "Este Pacto ya tiene un proveedor.",
  PACTO_NOT_ACTIVE: "Este Pacto ya no está activo.",
  INVALID_STATE: "El acuerdo ya avanzó y no admite nuevos participantes.",
  failed: "No se pudo aceptar la invitación. Intenta de nuevo en unos minutos.",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-layout">
      <aside className="auth-brand">
        <Link href="/">
          <Brand />
        </Link>
        <div>
          <span className="eyebrow">INVITACIÓN A UN PACTO</span>
          <h1>
            Un acuerdo claro.
            <br />
            <em>Revisado por ambas partes.</em>
          </h1>
          <p>Comprador y proveedor aceptan la misma versión, y cada decisión queda registrada.</p>
        </div>
      </aside>
      <section className="auth-form">{children}</section>
    </main>
  );
}

export default async function Invitation({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  const { error: actionError } = await searchParams;
  const here = `/invitacion/${token}`;

  if (!isConfigured())
    return (
      <Shell>
        <h2>{closedMessages.UNAVAILABLE.title}</h2>
        <p>{closedMessages.UNAVAILABLE.text}</p>
      </Shell>
    );

  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user)
    return (
      <Shell>
        <span className="eyebrow">TE INVITARON COMO PROVEEDOR</span>
        <h2>Únete al Pacto</h2>
        <p>
          Para ver el acuerdo y aceptarlo, entra con tu cuenta. Si aún no tienes una,
          puedes continuar como visitante DEMO sin registrarte.
        </p>
        <div className="stack">
          <Link className="button" href={`/sign-in?next=${encodeURIComponent(here)}`}>
            Iniciar sesión →
          </Link>
          <Link className="button button-light" href={`/demo?next=${encodeURIComponent(here)}`}>
            Continuar como visitante DEMO
          </Link>
          <p className="fine-print">
            ¿Prefieres crear una cuenta? <Link href="/sign-up">Regístrate</Link>, confirma tu
            correo y vuelve a abrir este enlace.
          </p>
        </div>
      </Shell>
    );

  const { data, error } = await db.rpc("invitation_preview", { p_token: token });
  const preview = (error ? { status: "UNAVAILABLE" } : data) as Preview | { status: "UNAVAILABLE" };

  if (preview.status === "JOINED" || preview.status === "OWN") {
    const p = preview as Preview;
    return (
      <Shell>
        <h2>{preview.status === "JOINED" ? "Ya eres parte de este Pacto" : "Este enlace es para tu proveedor"}</h2>
        <p>
          {preview.status === "JOINED"
            ? "Continúa el recorrido desde el acuerdo."
            : "Comparte el enlace con la persona que va a realizar el trabajo. Si lo abres tú, no se une nadie."}
        </p>
        <Link className="button" href={`/pactos/${p.pacto_id}`}>
          Ir al acuerdo «{p.title}» →
        </Link>
      </Shell>
    );
  }

  if (preview.status !== "OPEN") {
    const msg = closedMessages[preview.status] ?? closedMessages.NOT_FOUND;
    return (
      <Shell>
        <h2>{msg.title}</h2>
        <p>{msg.text}</p>
        <Link className="button button-light" href="/pactos">
          Ir a mis Pactos
        </Link>
      </Shell>
    );
  }

  const p = preview as Preview;
  return (
    <Shell>
      <span className="eyebrow">TE INVITARON COMO PROVEEDOR</span>
      <h2>{p.title}</h2>
      {actionError && (
        <div className="notice" role="alert">
          {errorMessages[actionError] ?? errorMessages.failed}
        </div>
      )}
      <div className="amount">
        {money.format(Number(p.total_cents) / 100)} <small>MXN</small>
      </div>
      <p className="scope">{p.scope}</p>
      <p className="fine-print">
        Al unirte podrás revisar el acuerdo, proponer cambios y aceptarlo. Unirte no
        significa aceptar todavía, y nada de esto ejecuta pagos.
      </p>
      <form action={acceptInvitation}>
        <input type="hidden" name="token" value={token} />
        <SubmitButton pendingText="Uniéndote…">Unirme como proveedor →</SubmitButton>
      </form>
      <p className="fine-print">
        Entraste como {user.is_anonymous ? "visitante DEMO" : user.email}.
      </p>
    </Shell>
  );
}
