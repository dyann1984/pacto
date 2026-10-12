// Configura ANTHROPIC_API_KEY de forma segura, verificándola antes.
//
//   node scripts/set-anthropic-key.mjs
//
// - Pide la clave con entrada oculta: no va en argumentos, no se imprime, no se registra.
// - Antes de guardar nada hace una petición real mínima (max_tokens 8) al modelo que usa
//   PACTO, para distinguir clave inválida (401), modelo inexistente (404) y cuenta sin
//   crédito o limitada (429).
// - Si responde bien, la escribe en .env.local y, si lo confirmas, en Vercel Production
//   como variable sensible (el valor viaja por stdin). Nunca con prefijo NEXT_PUBLIC_.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import readline from "node:readline";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const ENV_PATH = ".env.local";

// Una sola interfaz para todas las preguntas; `muted` silencia el eco.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let muted = false;
const write = rl._writeToOutput.bind(rl);
rl._writeToOutput = (s) => {
  if (!muted) write(s);
};
const lines = rl[Symbol.asyncIterator]();
async function ask(question, { hidden = false } = {}) {
  process.stdout.write(question);
  muted = hidden;
  const { value, done } = await lines.next();
  muted = false;
  if (hidden) process.stdout.write("\n");
  return done ? "" : String(value).trim();
}
const fail = (msg) => {
  console.error(`\nNO SE GUARDÓ NADA. ${msg}`);
  process.exit(1);
};

console.log(`Clave de Anthropic para PACTO (modelo ${MODEL}). Lo que pegues no se mostrará.\n`);
const key = await ask("ANTHROPIC_API_KEY: ", { hidden: true });
if (key.length < 30) fail("El valor parece incompleto.");

const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
  body: JSON.stringify({ model: MODEL, max_tokens: 8, messages: [{ role: "user", content: "ping" }] }),
  signal: AbortSignal.timeout(30_000),
});
if (res.status === 401) fail("Anthropic rechazó la clave (401).");
if (res.status === 404) fail(`Anthropic no reconoce el modelo "${MODEL}" (404). Revisa ANTHROPIC_MODEL.`);
if (res.status === 429) fail("La clave es válida pero la cuenta está limitada o sin crédito (429).");
if (!res.ok) fail(`Anthropic respondió HTTP ${res.status}.`);
console.log(`1. Clave válida: el modelo ${MODEL} respondió.`);

let env = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
if (env.charCodeAt(0) === 0xfeff) env = env.slice(1); // sin BOM: node --env-file no lo tolera
const line = `ANTHROPIC_API_KEY=${key}`;
env = /^ANTHROPIC_API_KEY=.*$/m.test(env)
  ? env.replace(/^ANTHROPIC_API_KEY=.*$/m, () => line)
  : `${env.replace(/\n?$/, "\n")}${line}\n`;
writeFileSync(ENV_PATH, env, "utf8");
console.log("2. .env.local actualizado.");

const answer = await ask("\n¿Guardarla también en Vercel Production? (s/N): ");
rl.close();
if (!/^s(i|í)?$/i.test(answer)) {
  console.log("Vercel no se modificó.");
  process.exit(0);
}
const r = spawnSync("npx", ["--yes", "vercel@latest", "env", "add", "ANTHROPIC_API_KEY", "production", "--force", "--sensitive"], {
  input: key,
  shell: process.platform === "win32",
  stdio: ["pipe", "ignore", "pipe"],
  encoding: "utf8",
});
if (r.status !== 0) {
  const reason = (r.stderr ?? "").split("\n").find((l) => /error/i.test(l)) ?? `código ${r.status}`;
  fail(`Vercel no guardó la clave (${reason.trim()}). .env.local sí quedó actualizado.`);
}
console.log("3. Vercel Production: ANTHROPIC_API_KEY guardada como sensible.");
console.log("\nListo. Hace falta un nuevo despliegue para que producción la use; avisa a Claude.");
