import "server-only";
import {
  buildAnalysisPrompt,
  parseAnalysisOutput,
  type AgreementAnalysis,
  type AnalysisInput,
} from "@/domain/agreement-analysis";

export const DEFAULT_ANALYSIS_MODEL = "claude-sonnet-5-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
// Los modelos actuales razonan antes de responder y ese razonamiento cuenta como
// salida: con un límite bajo el JSON llegaba truncado. 16000 es el valor
// recomendado para peticiones sin streaming; se factura solo lo que se genera.
const MAX_TOKENS = 16_000;
const TIMEOUT_MS = 90_000;

export type AnalysisOutcome =
  | { status: "NOT_CONFIGURED" }
  | {
      status: "OK";
      model: string;
      inputSha256: string;
      result: AgreementAnalysis;
    };

// Permite a la interfaz explicar que la IA no está activa en vez de ofrecer un botón que fallaría.
export function isAnalysisConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

type FetchLike =(url: string, init: RequestInit) => Promise<Response>;

// Llama al proveedor real. Sin ANTHROPIC_API_KEY no hay resultado simulado: se informa NOT_CONFIGURED.
// Los errores no incluyen el cuerpo de respuesta ni la clave, para no registrar secretos.
export async function analyzeAgreement(
  input: AnalysisInput,
  fetchImpl: FetchLike = fetch,
): Promise<AnalysisOutcome> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { status: "NOT_CONFIGURED" };
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_ANALYSIS_MODEL;
  const prompt = buildAnalysisPrompt(input);
  const response = await fetchImpl(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
  const body = (await response.json()) as {
    stop_reason?: string;
    content?: { type: string; text?: string }[];
  };
  // Una negativa o una respuesta cortada no se presentan como análisis.
  if (body.stop_reason === "refusal") throw new Error("PROVIDER_REFUSAL");
  if (body.stop_reason === "max_tokens") throw new Error("PROVIDER_TRUNCATED");
  const text = (body.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
  return {
    status: "OK",
    model,
    inputSha256: prompt.inputSha256,
    result: parseAnalysisOutput(text),
  };
}
