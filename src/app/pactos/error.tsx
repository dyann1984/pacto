"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="card empty-state">
      <h1>No pudimos completar la solicitud</h1>
      <p>
        Tu sesión o conexión puede necesitar revisión. No se ha mostrado
        información de otro Pacto.
      </p>
      <button className="button" onClick={reset}>
        Intentar de nuevo
      </button>
    </section>
  );
}
