import Link from "next/link";
import { Brand } from "@/components/brand";
export default function Landing() {
  return (
    <main className="landing">
      <header className="landing-nav">
        <Link href="/" aria-label="PACTO inicio">
          <Brand />
        </Link>
        <nav>
          <a href="#proceso">Cómo funciona</a>
          <Link className="button button-outline" href="/sign-in">
            Iniciar sesión ↗
          </Link>
        </nav>
      </header>
      <section className="hero">
        <div>
          <span className="eyebrow">
            ACUERDOS CLAROS. DECISIONES INFORMADAS.
          </span>
          <h1>
            Convierte tus acuerdos en <em>resultados reales.</em>
          </h1>
          <p className="hero-copy">
            Define lo que esperas y deja que la IA detecte los riesgos del acuerdo
            antes de aceptarlo. Cada entrega se respalda con evidencia, se paga con
            PayPal solo cuando el cliente la autoriza, y cada decisión queda auditada.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/demo">
              Explorar DEMO <span>→</span>
            </Link>
            <Link className="button button-outline" href="/juez">
              Modo Juez
            </Link>
            <Link className="button button-outline" href="/sign-up">
              Crear mi cuenta
            </Link>
          </div>
          <p className="fine-print">
            Explora sin registrarte: una sesión temporal y privada. ¿Evalúas PACTO?
            El <Link href="/juez">Modo Juez</Link> te deja recorrer el ciclo completo
            tú solo, actuando como cliente y como proveedor.
          </p>
        </div>
        <div className="brand-panel">
          <div className="brand-halo" />
          <Brand large />
          <p>
            AI COMMERCE.
            <br />
            <strong>REAL RESULTS.</strong>
          </p>
          <div className="brand-rule" />
          <span>
            La confianza empieza
            <br />
            con un acuerdo claro.
          </span>
        </div>
      </section>
      <section id="proceso" className="process">
        <div className="section-intro">
          <span className="eyebrow">UNA BASE PARA CADA ACUERDO</span>
          <h2>
            De la intención a una
            <br />
            decisión compartida.
          </h2>
        </div>
        <div className="process-grid">
          {[
            [
              "01",
              "Define el alcance",
              "Describe el trabajo, sus límites y el importe acordado.",
            ],
            [
              "02",
              "La IA revisa el acuerdo",
              "Señala ambigüedades, plazos ausentes, riesgos e inconsistencias antes de aceptar. Asiste; no decide por nadie.",
            ],
            [
              "03",
              "Ambas partes aceptan",
              "Comprador y proveedor aceptan exactamente la misma versión.",
            ],
            [
              "04",
              "Entrega con evidencia",
              "El proveedor describe lo entregado; el cliente lo revisa y lo autoriza.",
            ],
            [
              "05",
              "Pago con PayPal",
              "El cliente paga el hito autorizado con PayPal (Sandbox). Solo cuenta como pagado lo que PayPal confirma.",
            ],
            [
              "06",
              "Trazabilidad completa",
              "Cada decisión, pago y reembolso queda en un registro inalterable.",
            ],
          ].map(([n, title, copy]) => (
            <article className="process-card" key={n}>
              <span>{n}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>
      <footer>
        <Brand />
        <span>AI Commerce. Real Results.</span>
        <span>Acuerdos claros entre comprador y proveedor</span>
      </footer>
    </main>
  );
}
