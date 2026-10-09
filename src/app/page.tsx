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
            Define lo que esperas. Alinea cada entrega. Conserva el control de
            las decisiones que importan. Comprador y proveedor aceptan la
            misma versión, y cada decisión queda auditada.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/demo">
              Explorar DEMO <span>→</span>
            </Link>
            <Link className="button button-outline" href="/sign-up">
              Crear mi cuenta
            </Link>
          </div>
          <p className="fine-print">
            Explora sin registrarte: sesión aislada y temporal, sin datos
            reales. FOUNDATION · IA y pagos: próxima fase.
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
              "Revisa con la otra parte",
              "Comprador y proveedor aceptan la misma versión.",
            ],
            [
              "03",
              "Conserva la trazabilidad",
              "Consulta quién hizo cada cambio y cuándo ocurrió.",
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
        <span>PHASE 1 · FOUNDATION</span>
      </footer>
    </main>
  );
}
