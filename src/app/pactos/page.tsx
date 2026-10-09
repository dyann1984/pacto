import Link from "next/link";
import { requireSession } from "@/lib/session";
export default async function Pactos() {
  const { db } = await requireSession();
  const { data, error } = await db
    .from("pactos")
    .select("id,title,environment,created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error("No se pudo consultar tus Pactos.");
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">TU ESPACIO DE ACUERDOS</span>
          <h1>Mis Pactos</h1>
          <p>Una vista clara de los acuerdos en los que participas.</p>
        </div>
        <Link className="button" href="/pactos/new">
          Crear Pacto ＋
        </Link>
      </div>
      {data?.length ? (
        <div className="pacto-grid">
          {data.map((p) => (
            <Link
              className="card pacto-card"
              href={`/pactos/${p.id}`}
              key={p.id}
            >
              <span className="badge">{p.environment}</span>
              <h2>{p.title}</h2>
              <p>
                Creado{" "}
                {new Date(p.created_at).toLocaleDateString("es-MX", {
                  timeZone: "America/Mexico_City",
                })}
              </p>
              <span className="card-link">Abrir Command Center →</span>
            </Link>
          ))}
        </div>
      ) : (
        <section className="card empty-state">
          <span className="eyebrow">EL PRIMER PASO</span>
          <h2>Tu próximo acuerdo empieza aquí.</h2>
          <p>No tienes Pactos disponibles. Crea uno y define su alcance.</p>
          <Link className="button" href="/pactos/new">
            Crear mi primer Pacto →
          </Link>
        </section>
      )}
    </>
  );
}
