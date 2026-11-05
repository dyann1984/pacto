// Destino interno tras iniciar sesión o entrar como visitante DEMO. Solo rutas
// relativas del propio sitio: nada de "//otro-dominio", esquemas ni barras invertidas.
export function safeNextPath(value: unknown, fallback = "/pactos") {
  if (typeof value !== "string") return fallback;
  if (!/^\/(?![/\\])[A-Za-z0-9\-._~/%?=&]*$/.test(value)) return fallback;
  return value;
}
