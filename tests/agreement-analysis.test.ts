import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildAnalysisPrompt,
  classifyAnalysisError,
  parseAnalysisOutput,
  type AnalysisInput,
} from "@/domain/agreement-analysis";
import { analyzeAgreement, DEFAULT_ANALYSIS_MODEL } from "@/lib/ai";

const input: AnalysisInput = {
  scope: "Impermeabilizar la cubierta. El pago se realiza a la entrega.",
  totalCents: 1740000,
  milestones: [{ title: "Entrega", amount_cents: 1740000, sequence: 1 }],
};

const validOutput = {
  summary: "El alcance no define plazo de entrega.",
  findings: [
    {
      category: "DATE",
      severity: "HIGH",
      quote: "",
      explanation: "No hay fecha de entrega.",
      suggestion: "Agregar fecha límite.",
    },
  ],
  limitations: "Análisis basado solo en el texto.",
};

function providerResponse(text: string) {
  return new Response(
    JSON.stringify({ content: [{ type: "text", text }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("buildAnalysisPrompt", () => {
  it("wraps the agreement in delimiters and hashes the canonical input", () => {
    const prompt = buildAnalysisPrompt(input);
    expect(prompt.user).toContain("<acuerdo>");
    expect(prompt.user).toContain("Impermeabilizar la cubierta");
    expect(prompt.inputSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(buildAnalysisPrompt(input).inputSha256).toBe(prompt.inputSha256);
    expect(
      buildAnalysisPrompt({ ...input, totalCents: 1740001 }).inputSha256,
    ).not.toBe(prompt.inputSha256);
  });

  it("does not mutate the caller's milestone order", () => {
    const milestones = [
      { title: "B", amount_cents: 1, sequence: 2 },
      { title: "A", amount_cents: 1, sequence: 1 },
    ];
    buildAnalysisPrompt({ ...input, milestones });
    expect(milestones[0].title).toBe("B");
  });
});

describe("classifyAnalysisError: each cause gets its own remedy", () => {
  const err = (message: string, name = "Error") => Object.assign(new Error(message), { name });

  it("configuration errors are not presented as transient", () => {
    for (const s of ["401", "403", "404"]) expect(classifyAnalysisError(err(`PROVIDER_HTTP_${s}`))).toBe("config");
  });
  it("consumption limits and overload say «wait»", () => {
    expect(classifyAnalysisError(err("PROVIDER_BUSY"))).toBe("saturado");
  });
  it("provider failures and timeouts say «try again later»", () => {
    expect(classifyAnalysisError(err("PROVIDER_HTTP_500"))).toBe("proveedor");
    expect(classifyAnalysisError(err("PROVIDER_HTTP_503"))).toBe("proveedor");
    expect(classifyAnalysisError(err("The operation was aborted due to timeout", "TimeoutError"))).toBe("proveedor");
    expect(classifyAnalysisError(err("fetch failed", "TypeError"))).toBe("proveedor");
  });
  it("an unusable answer is never shown half-done", () => {
    for (const m of ["PROVIDER_REFUSAL", "PROVIDER_TRUNCATED", "INVALID_OUTPUT"]) expect(classifyAnalysisError(err(m))).toBe("salida");
  });
  it("anything else falls back to the generic failure", () => {
    expect(classifyAnalysisError(err("PROVIDER_HTTP_400"))).toBe("failed");
    expect(classifyAnalysisError(undefined)).toBe("failed");
  });
});

describe("parseAnalysisOutput", () => {
  it("accepts JSON wrapped in prose and validates the schema", () => {
    const parsed = parseAnalysisOutput(
      `Aquí está el análisis:\n${JSON.stringify(validOutput)}\nFin.`,
    );
    expect(parsed.findings[0].category).toBe("DATE");
  });

  it("rejects output that is not JSON", () => {
    expect(() => parseAnalysisOutput("sin llaves")).toThrow("INVALID_OUTPUT");
    expect(() => parseAnalysisOutput("{roto")).toThrow("INVALID_OUTPUT");
  });

  it("rejects unknown categories and oversized fields", () => {
    const bad = {
      ...validOutput,
      findings: [{ ...validOutput.findings[0], category: "OPINION" }],
    };
    expect(() => parseAnalysisOutput(JSON.stringify(bad))).toThrow(
      "INVALID_OUTPUT",
    );
    const long = {
      ...validOutput,
      summary: "x".repeat(1201),
    };
    expect(() => parseAnalysisOutput(JSON.stringify(long))).toThrow(
      "INVALID_OUTPUT",
    );
  });
});

describe("analyzeAgreement", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  const originalModel = process.env.ANTHROPIC_MODEL;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.ANTHROPIC_MODEL;
    else process.env.ANTHROPIC_MODEL = originalModel;
  });

  it("reports NOT_CONFIGURED without calling the provider when no key exists", async () => {
    const fetchSpy = vi.fn();
    const outcome = await analyzeAgreement(input, fetchSpy);
    expect(outcome).toEqual({ status: "NOT_CONFIGURED" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls the Anthropic Messages API with the key in a header and returns validated output", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    const fetchSpy = vi.fn(async () =>
      providerResponse(JSON.stringify(validOutput)),
    );
    const outcome = await analyzeAgreement(input, fetchSpy);
    expect(outcome.status).toBe("OK");
    if (outcome.status !== "OK") return;
    expect(outcome.model).toBe(DEFAULT_ANALYSIS_MODEL);
    expect(outcome.result.findings).toHaveLength(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("test-key-not-real");
    const sent = JSON.parse(String(init.body));
    expect(sent.model).toBe(DEFAULT_ANALYSIS_MODEL);
    expect(sent.system).toContain("no decides nada");
  });

  it("honors ANTHROPIC_MODEL and never echoes the key in provider errors", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    process.env.ANTHROPIC_MODEL = "claude-test-model";
    const fetchSpy = vi.fn(async () => new Response("denied", { status: 401 }));
    const error = await analyzeAgreement(input, fetchSpy).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("PROVIDER_HTTP_401");
    expect((error as Error).message).not.toContain("test-key-not-real");
    const sent = JSON.parse(String((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent.model).toBe("claude-test-model");
  });

  it("fails closed when the model returns invalid output", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    const fetchSpy = vi.fn(async () => providerResponse("No puedo ayudar."));
    await expect(analyzeAgreement(input, fetchSpy)).rejects.toThrow(
      "INVALID_OUTPUT",
    );
  });
});
