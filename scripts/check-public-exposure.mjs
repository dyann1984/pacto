// Verifica que ningún secreto privado llegue al frontend ni al repositorio.
// Solo imprime rutas y recuentos; nunca imprime valores encontrados.
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const failures = [];

// Variables privadas: cualquier nombre que no sea NEXT_PUBLIC_* y que contenga estos términos.
const privateNamePattern = /(SERVICE_ROLE|SECRET|PASSWORD|ANTHROPIC|API_KEY|TOKEN|PRIVATE)/;
// Patrones de valores reales de secretos (no nombres de variables).
const secretValuePatterns = [
  { name: "clave secreta de Supabase", re: /sb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: "clave de Anthropic", re: /sk-ant-[A-Za-z0-9_-]{10,}/ },
  { name: "JWT con rol service_role", re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
];

const trackedFiles = execSync("git ls-files", { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((f) => !/\.(png|jpe?g|gif|webp|ico|woff2?|pdf)$/i.test(f) && !f.startsWith("docs/screenshots/"));

// 1. Archivos rastreados: valores de secretos.
for (const file of trackedFiles) {
  if (!existsSync(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const { name, re } of secretValuePatterns) {
    if (re.test(text)) failures.push(`${file}: contiene un valor con forma de ${name}`);
  }
}

// 2. Archivos de entorno: solo .env.example puede estar versionado.
const trackedEnv = trackedFiles.filter((f) => /(^|\/)\.env(\..+)?$/.test(f) && f !== ".env.example");
for (const file of trackedEnv) failures.push(`${file}: archivo de entorno versionado`);
try {
  execSync("git check-ignore -q .env.local", { stdio: "ignore" });
} catch {
  failures.push(".env.local no está ignorado por Git");
}

// 3. Código de cliente: "use client" no debe leer variables privadas.
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}
for (const file of walk(join(root, "src"))) {
  const text = readFileSync(file, "utf8");
  const isClient = /^\s*["']use client["']/m.test(text);
  const envRefs = [...text.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]);
  for (const name of envRefs) {
    const isPublic = name.startsWith("NEXT_PUBLIC_");
    if (!isPublic && privateNamePattern.test(name) && isClient) {
      failures.push(`${relative(root, file)}: componente cliente lee ${name}`);
    }
    if (!isPublic && privateNamePattern.test(name) && !file.includes(join("src", "lib"))) {
      // Solo lib/ (server-only) puede leer secretos; cualquier otro punto de lectura se revisa.
      failures.push(`${relative(root, file)}: lee ${name} fuera de src/lib`);
    }
  }
  if (envRefs.some((n) => n.startsWith("NEXT_PUBLIC_") && privateNamePattern.test(n))) {
    failures.push(`${relative(root, file)}: variable pública con nombre sensible`);
  }
}

// 4. Bundle de cliente compilado (si existe): no debe contener nombres de secretos.
const staticDir = join(root, ".next", "static");
if (existsSync(staticDir)) {
  const forbiddenInBundle = ["ANTHROPIC_API_KEY", "SUPABASE_SERVICE_ROLE", "service_role"];
  let scanned = 0;
  for (const file of walk(staticDir)) {
    scanned++;
    const text = readFileSync(file, "utf8");
    for (const token of forbiddenInBundle) {
      if (text.includes(token)) failures.push(`${relative(root, file)}: el bundle de cliente contiene ${token}`);
    }
  }
  console.log(`Bundle de cliente revisado: ${scanned} archivos.`);
} else {
  console.log("Bundle de cliente no revisado: ejecutar pnpm build antes.");
}

console.log(`Archivos rastreados revisados: ${trackedFiles.length}.`);
if (failures.length) {
  console.log(`\nFALLA: ${failures.length} hallazgo(s):`);
  for (const f of failures) console.log(`- ${f}`);
  process.exit(1);
}
console.log("OK: no se encontraron secretos privados en el frontend ni en el repositorio.");
