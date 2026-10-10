import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { explainViewer } from "../src/domain/access";

/**
 * El 404 debe explicar la sesión de quien mira, nunca el recurso. «Pacto no disponible»
 * cubría a la vez tres situaciones distintas, y un evaluador en Modo Juez o en una
 * sesión DEMO nueva concluía que PACTO estaba roto:
 *   - Modo Juez: el Pacto es de la otra identidad DEMO, o de un recorrido reiniciado.
 *   - Sesión DEMO: lo creó otra sesión anónima, aislada por RLS.
 *   - Cuenta real: o no existe, o no participa (indistinguibles a propósito).
 */

describe("el 404 distingue las tres causas sin filtrar el recurso", () => {
  it("el Modo Juez manda, sin necesidad de mirar la sesión", () => {
    expect(explainViewer(true, null)).toBe("judge");
    expect(explainViewer(true, { is_anonymous: true })).toBe("judge");
    expect(explainViewer(true, { is_anonymous: false })).toBe("judge");
  });

  it("distingue un visitante DEMO anónimo de una cuenta real", () => {
    expect(explainViewer(false, { is_anonymous: true })).toBe("demo");
    expect(explainViewer(false, { is_anonymous: false })).toBe("account");
    // Supabase puede omitir la bandera: entonces es una cuenta, no una sesión DEMO.
    expect(explainViewer(false, {})).toBe("account");
  });

  it("sin sesión abierta lo dice, en vez de hablar del recurso", () => {
    expect(explainViewer(false, null)).toBe("anonymous");
  });

  it("no lee nada del recurso: no puede revelar qué Pactos existen", async () => {
    const source = await readFile("src/components/access-explainer.tsx", "utf8");
    // Ninguna consulta a la base, ningún parámetro de ruta, ninguna entrada externa:
    // el componente no puede convertirse en un oráculo de existencia.
    for (const forbidden of [".from(", ".rpc(", "useParams", "useSearchParams", "pactoId"])
      expect(source).not.toContain(forbidden);
  });

  it("el 404 del servidor sigue siendo el mismo para las tres causas", async () => {
    const source = await readFile("src/app/not-found.tsx", "utf8");
    // Una única respuesta, sin ramas por tipo de causa en el servidor.
    expect(source).toContain("No existe, o no eres participante");
    for (const forbidden of ["searchParams", "params", "cookies(", "requireSession"])
      expect(source).not.toContain(forbidden);
  });
});
