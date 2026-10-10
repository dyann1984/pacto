"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { startJudgeMode } from "@/lib/judge-session";

/**
 * Modo Juez: punto de entrada para evaluar PACTO sin necesitar dos personas.
 * Prepara dos sesiones DEMO reales y aisladas (cliente y proveedor) y deja
 * activa la del cliente para empezar el recorrido.
 */
export default function JudgeMode() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "error" | "rate-limited">("idle");

  async function begin() {
    setState("working");
    try {
      await startJudgeMode();
      router.push("/pactos/new?juez=1");
    } catch (error) {
      setState((error as Error).message === "DEMO_RATE_LIMITED" ? "rate-limited" : "error");
    }
  }

  return (
    <main className="auth-layout">
      <aside className="auth-brand">
        <Link href="/">
          <Brand />
        </Link>
        <div>
          <span className="eyebrow">MODO JUEZ</span>
          <h1>
            Recorre PACTO entero.
            <br />
            <em>Tú solo, en cinco minutos.</em>
          </h1>
          <p>
            Un acuerdo necesita dos partes. Aquí preparamos las dos por ti y puedes
            cambiar de una a otra cuando quieras.
          </p>
        </div>
      </aside>
      <section className="auth-form">
        <Link className="back-link" href="/">
          ← Volver al inicio
        </Link>
        <span className="eyebrow">EVALUACIÓN GUIADA</span>
        <h2>Modo Juez</h2>
        <p>
          Vas a recorrer el ciclo completo: crear el acuerdo, invitar al proveedor,
          aceptar por ambas partes, presentar evidencia de entrega, autorizar el pago
          y cerrar.
        </p>

        <ol className="judge-steps">
          <li>
            <strong>Dos identidades reales, no simuladas.</strong> Creamos dos
            sesiones DEMO independientes, cada una con su propio usuario en la base
            de datos.
          </li>
          <li>
            <strong>Cambias de papel con un botón.</strong> Una barra superior te dice
            quién eres en cada momento y te deja pasar a la otra parte.
          </li>
          <li>
            <strong>Las reglas no cambian.</strong> El servidor aplica exactamente las
            mismas comprobaciones que a cualquier usuario: no se puede pagar sin
            autorizar, ni autorizar tu propio cobro.
          </li>
        </ol>

        {state === "rate-limited" && (
          <div className="notice" role="alert">
            <strong>Demasiadas sesiones de prueba en la última hora</strong>
            <p>
              PACTO limita cuántas sesiones anónimas se crean por hora, para evitar
              abusos. Espera unos minutos y vuelve a intentarlo, o{" "}
              <Link href="/demo">entra en la DEMO normal</Link>, que usa una sola
              sesión.
            </p>
          </div>
        )}
        {state === "error" && (
          <div className="notice" role="alert">
            <strong>No se pudo preparar el Modo Juez</strong>
            <p>
              Inténtalo de nuevo en unos minutos, o{" "}
              <Link href="/demo">entra en la DEMO normal</Link>.
            </p>
          </div>
        )}

        <button className="button" onClick={begin} disabled={state === "working"}>
          {state === "working" ? "Preparando el escenario…" : "Comenzar el recorrido →"}
        </button>

        <p className="fine-print">
          Se crea un escenario nuevo y aislado. No se modifica ni se borra nada de lo
          que ya exista en PACTO. Podrás reiniciarlo cuando quieras.
        </p>
        <p className="fine-print">
          ¿Prefieres explorar por tu cuenta?{" "}
          <Link href="/demo">Entra como visitante DEMO</Link>.
        </p>
      </section>
    </main>
  );
}
