import Link from "next/link";
import { AccessExplainer } from "@/components/access-explainer";
import { JudgeBar } from "@/components/judge-bar";

// Misma respuesta para «no existe», «no participas» y «lo creó otra sesión DEMO»: el
// servidor no debe permitir averiguar qué Pactos existen. La explicación de la sesión
// propia la añade AccessExplainer en el cliente, sin consultar nada del recurso.
export default function NotFound() {
  return (
    <main className="standalone card">
      <h1>Pacto no disponible</h1>
      <p>
        No existe, o no eres participante de este recurso. Por seguridad, PACTO responde lo
        mismo en ambos casos.
      </p>
      <AccessExplainer />
      <JudgeBar />
      <Link className="button" href="/pactos">
        Volver a mis Pactos
      </Link>
    </main>
  );
}
