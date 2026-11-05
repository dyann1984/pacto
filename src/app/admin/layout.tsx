import Link from "next/link";
import { Brand } from "@/components/brand";
import { requireAdmin } from "@/lib/session";
import { signOut } from "@/app/sign-in/actions";
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireAdmin();
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link href="/">
          <Brand />
        </Link>
        <span className="nav-label">ADMINISTRACIÓN</span>
        <nav>
          <Link href="/admin">▦ Resumen</Link>
          <Link href="/pactos">← Volver a mis Pactos</Link>
        </nav>
        <div className="sidebar-foot">
          <span className="badge badge-dark">ADMIN</span>
          <p>
            Acceso exclusivo.
            <br />
            Auditado por servidor.
          </p>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-header">
          <span>Panel administrativo de PACTO</span>
          <div>
            <span className="user-email">{user.email}</span>
            <form action={signOut}>
              <button className="text-button">Cerrar sesión</button>
            </form>
          </div>
        </header>
        <main className="workspace-content">{children}</main>
      </div>
    </div>
  );
}
