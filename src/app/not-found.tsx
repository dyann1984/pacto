import Link from "next/link";
export default function NotFound() {
  return (
    <main className="standalone card">
      <h1>Pacto no disponible</h1>
      <p>No existe o no tienes acceso a este recurso.</p>
      <Link className="button" href="/pactos">
        Volver a mis Pactos
      </Link>
    </main>
  );
}
