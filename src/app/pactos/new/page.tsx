import { createPacto } from "../actions";
export default async function Create({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; juez?: string }>;
}) {
  const { status, juez } = await searchParams;
  // En Modo Juez el formulario llega relleno con un escenario realista, para que
  // la evaluación empiece por lo que importa en vez de por teclear.
  const sample = juez === "1";
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DEL PROPÓSITO AL ACUERDO</span>
          <h1>Crear un Pacto</h1>
          <p>Define lo que esperas. Después invitarás a tu proveedor a revisarlo.</p>
        </div>
      </div>
      <section className="card form-card">
        {status && (
          <div className="notice" role="alert">
            {status === "invalid"
              ? "Revisa los campos y el importe."
              : "No se pudo crear el Pacto. Intenta de nuevo en unos minutos."}
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
              defaultValue={sample ? "Rediseño de tienda en línea" : undefined}
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
              defaultValue={
                sample
                  ? "Rediseñar la tienda en línea, migrar el catálogo de 120 productos y capacitar al equipo durante una sesión. No incluye fotografía de producto ni redacción de contenidos. Se considera entregado cuando la tienda esté publicada en el dominio del cliente y el equipo haya recibido la capacitación."
                  : undefined
              }
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
              defaultValue={sample ? "25000" : undefined}
              required
            />
          </label>
          <div className="notice notice-info">
            Después de crearlo podrás invitar a tu proveedor con un enlace seguro.
            Ambos revisan y aceptan la misma versión. Crear el acuerdo no cobra nada:
            solo se paga con PayPal un hito que el cliente haya autorizado.
          </div>
          <button className="button">Crear acuerdo →</button>
        </form>
      </section>
    </>
  );
}
