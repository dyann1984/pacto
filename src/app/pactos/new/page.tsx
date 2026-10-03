import { createPacto } from "../actions";
export default async function Create({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DEL PROPÓSITO AL ACUERDO</span>
          <h1>Crear un Pacto</h1>
          <p>Define la base. Después podrás revisarla con tu proveedor.</p>
        </div>
        <span className="badge">DEMO</span>
      </div>
      <section className="card form-card">
        {status && (
          <div className="notice" role="alert">
            {status === "invalid"
              ? "Revisa los campos y el importe."
              : "No se pudo crear el Pacto. Verifica la conexión y la migración."}
          </div>
        )}
        <form action={createPacto}>
          <label>
            Nombre del acuerdo
            <input
              name="title"
              minLength={4}
              maxLength={120}
              placeholder="Ej. Impermeabilización residencial"
              required
            />
          </label>
          <label>
            Alcance y criterios de aceptación
            <textarea
              name="scope"
              minLength={10}
              maxLength={5000}
              rows={6}
              placeholder="Describe qué se entrega, qué queda fuera y cómo ambas partes comprobarán la entrega."
              required
            />
          </label>
          <label>
            Importe acordado · MXN
            <input
              name="amount"
              type="number"
              min="1"
              max="1000000"
              step="0.01"
              required
            />
          </label>
          <div className="notice">
            Foundation crea un hito básico. Sin generación IA ni operación de
            pago. El escenario se guarda como DEMO.
          </div>
          <button className="button">Crear acuerdo →</button>
        </form>
      </section>
    </>
  );
}
