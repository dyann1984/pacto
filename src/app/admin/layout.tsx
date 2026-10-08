import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { requireSession } from "@/lib/session";
import { signOut } from "@/app/sign-in/actions";
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { db, user } = await requireSession();
  // La propia fila del usuario: la política own_profile ya permite esta lectura.
  const { data: profile, error } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error("No se pudo verificar el rol.");
  // 404, no redirección: no revela que /admin existe a quien no tiene acceso.
  if (profile?.role !== "admin") notFound();
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
