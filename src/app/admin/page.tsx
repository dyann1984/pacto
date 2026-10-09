import { requireSession } from "@/lib/session";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const dateFmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })
    : "—";

const roleLabel: Record<string, string> = { admin: "Administrador", user: "Usuario" };
const eventLabels: Record<string, string> = {
  PACTO_CREATED: "Pacto creado",
  PARTICIPANT_ADDED: "Participante añadido",
  AGREEMENT_CREATED: "Acuerdo creado",
  AGREEMENT_SUBMITTED: "Enviado a revisión",
  AGREEMENT_ACCEPTED: "Aceptación registrada",
  AGREEMENT_UPDATED: "Versión editada",
  CLOSURE_CONFIRMED: "Confirmación de cierre",
  PACTO_CLOSED: "Pacto cerrado",
  PACTO_CANCELLED: "Pacto cancelado",
  AI_ANALYSIS_RECORDED: "Análisis de IA registrado",
};

type AdminUser = {
  id: string;
  email: string;
  role: string;
  created_at: string;
  confirmed: boolean;
  last_sign_in_at: string | null;
};

export default async function AdminOverview() {
  const { db } = await requireSession();

  const [usersResult, pactosResult, agreementsResult, auditResult] = await Promise.all([
    db.rpc("admin_list_users"),
    db
      .from("pactos")
      .select("id,title,status,status_reason,environment,created_at")
      .order("created_at", { ascending: false }),
    db
      .from("agreements")
      .select("id,pacto_id,version,state,total_cents,created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("audit_events")
      .select("id,pacto_id,actor_id,event_type,detail,created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (usersResult.error) throw new Error("No se pudo consultar a los usuarios.");
  if (pactosResult.error) throw new Error("No se pudieron consultar los Pactos.");
  if (agreementsResult.error) throw new Error("No se pudieron consultar los acuerdos.");
  if (auditResult.error) throw new Error("No se pudo consultar la actividad.");

  const users = (usersResult.data ?? []) as AdminUser[];
  const pactos = pactosResult.data ?? [];
  const agreements = agreementsResult.data ?? [];
  const events = auditResult.data ?? [];

  const pactosByStatus = pactos.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});
  const pactoTitle = new Map(pactos.map((p) => [p.id, p.title]));
  const admins = users.filter((u) => u.role === "admin").length;

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PANEL ADMINISTRATIVO</span>
          <h1>Resumen operativo</h1>
          <p>Usuarios, Pactos, acuerdos y actividad en todo PACTO.</p>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-tile">
          <span className="stat-value">{users.length}</span>
          <span className="stat-label">Usuarios registrados</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{admins}</span>
          <span className="stat-label">Administradores</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{pactos.length}</span>
          <span className="stat-label">Pactos totales</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{pactosByStatus.ACTIVE ?? 0}</span>
          <span className="stat-label">Pactos activos</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{pactosByStatus.CLOSED ?? 0}</span>
          <span className="stat-label">Pactos cerrados</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{pactosByStatus.CANCELLED ?? 0}</span>
          <span className="stat-label">Pactos cancelados</span>
        </div>
      </div>

      <section className="card">
        <div className="card-heading">
          <h2>Usuarios registrados</h2>
          <span className="badge badge-neutral">{users.length}</span>
        </div>
        <p className="fine-print">
          Solo lectura. El rol de administrador se asigna mediante una migración
          controlada, nunca desde esta pantalla ni desde el registro.
        </p>
        <div className="admin-table">
          <div className="admin-table-row admin-table-head">
            <span>Correo</span>
            <span>Rol</span>
            <span>Confirmado</span>
            <span>Último acceso</span>
            <span>Registrado</span>
          </div>
          {users.map((u) => (
            <div className="admin-table-row" key={u.id}>
              <span>{u.email}</span>
              <span>
                <span className={`badge ${u.role === "admin" ? "badge-dark" : "badge-neutral"}`}>
                  {roleLabel[u.role] ?? u.role}
                </span>
              </span>
              <span>{u.confirmed ? "Sí" : "No"}</span>
              <span>{dateFmt(u.last_sign_in_at)}</span>
              <span>{dateFmt(u.created_at)}</span>
            </div>
          ))}
          {users.length === 0 && <p className="fine-print">Sin usuarios todavía.</p>}
        </div>
      </section>

      <section className="card">
        <div className="card-heading">
          <h2>Pactos y acuerdos</h2>
          <span className="badge badge-neutral">{agreements.length}</span>
        </div>
        <div className="admin-table">
          <div className="admin-table-row admin-table-head">
            <span>Pacto</span>
            <span>Versión</span>
            <span>Estado</span>
            <span>Importe</span>
            <span>Creado</span>
          </div>
          {agreements.map((a) => (
            <div className="admin-table-row" key={a.id}>
              <span>{pactoTitle.get(a.pacto_id) ?? a.pacto_id}</span>
              <span>v{a.version}</span>
              <span>{a.state}</span>
              <span>{money.format(a.total_cents / 100)}</span>
              <span>{dateFmt(a.created_at)}</span>
            </div>
          ))}
          {agreements.length === 0 && <p className="fine-print">Sin acuerdos todavía.</p>}
        </div>
      </section>

      <section className="card audit-card">
        <div className="card-heading">
          <h2>Actividad y auditoría</h2>
          <span className="badge badge-neutral">Últimos {events.length}</span>
        </div>
        {events.map((e) => (
          <div className="audit-row" key={e.id}>
            <span className="audit-dot" />
            <div>
              <strong>{eventLabels[e.event_type] ?? e.event_type}</strong>
              <p>
                {pactoTitle.get(e.pacto_id) ?? e.pacto_id} · actor {e.actor_id}
                {e.detail ? ` · "${e.detail}"` : ""}
              </p>
            </div>
            <time dateTime={e.created_at}>{dateFmt(e.created_at)}</time>
          </div>
        ))}
        {events.length === 0 && <p className="fine-print">Sin actividad todavía.</p>}
      </section>
    </>
  );
}
