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
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link href="/">
          <Brand />
        </Link>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          <Link href="/pactos">▦ Mis Pactos</Link>
          <Link href="/pactos/new">＋ Crear Pacto</Link>
        </nav>
        <div className="sidebar-foot">
          <span className="badge badge-dark">FOUNDATION</span>
          <p>
            IA, evidencia y PayPal
            <br />
            Próxima fase
          </p>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-header">
          <span>Acuerdos claros. Resultados reales.</span>
          <div>
            <span className="user-email">{user.email}</span>
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
