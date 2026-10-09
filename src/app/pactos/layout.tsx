import Link from "next/link";
import { Brand } from "@/components/brand";
import { requireSession } from "@/lib/session";
import { signOut } from "@/app/sign-in/actions";
export const dynamic = "force-dynamic";
export default async function PactoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireSession();
  const isDemoVisitor = Boolean(user.is_anonymous);
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link href="/">
          <Brand />
        </Link>
        <span className="nav-label">TU ESPACIO</span>
        <nav>
          <Link href="/pactos">▦ Mis Pactos</Link>
          <Link href="/pactos/new">＋ Crear Pacto</Link>
        </nav>
        <div className="sidebar-foot">
          <span className="badge badge-dark">CÓMO FUNCIONA</span>
          <p>
            Crea · Invita · Acepten
            <br />
            ambos · Cierren
          </p>
        </div>
      </aside>
      <div className="workspace-main">
        {isDemoVisitor && (
          <div className="notice notice-info demo-banner" role="status">
            Estás en <strong>modo DEMO</strong>: una sesión temporal y privada,
            separada de cualquier otro usuario. <Link href="/sign-up">Crea una cuenta</Link>{" "}
            para conservar tus Pactos.
          </div>
        )}
        <header className="workspace-header">
          <span>Acuerdos claros. Resultados reales.</span>
          <div>
            <span className="user-email">
              {isDemoVisitor ? "Visitante DEMO" : user.email}
            </span>
            <form action={signOut}>
              <button className="text-button">Cerrar sesión</button>
            </form>
          </div>
        </header>
        <nav className="mobile-nav">
          <Link href="/pactos">Mis Pactos</Link>
          <Link href="/pactos/new">＋ Crear</Link>
        </nav>
        <main className="workspace-content">{children}</main>
      </div>
    </div>
  );
}
