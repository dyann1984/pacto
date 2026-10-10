/**
 * Supabase limita cuántas sesiones anónimas se crean por hora y por dirección
 * IP. Para la DEMO y el Modo Juez ese caso no es un fallo: es una espera, y
 * decírselo a la persona cambia por completo lo que hace a continuación
 * (esperar unos minutos en vez de concluir que PACTO está roto).
 *
 * La regla vive aquí, en un solo sitio, porque la consultan las dos puertas de
 * entrada —`/demo` y el Modo Juez— y deben coincidir.
 */

/** Forma mínima de un error de Supabase Auth, sin acoplarse a su tipo exacto. */
type AuthErrorLike = { status?: number; code?: string } | null | undefined;

export function isRateLimited(error: AuthErrorLike): boolean {
  if (!error) return false;
  return error.status === 429 || error.code === "over_request_rate_limit";
}

/**
 * El servicio de correo integrado de Supabase está limitado a unos pocos envíos
 * por hora (ver docs/pending-public-launch.md). Al agotarse, registrarse
 * devuelve 429 / over_email_send_rate_limit. Presentarlo como "no se pudo
 * completar el registro" hace pensar que PACTO está roto, cuando basta esperar
 * o entrar por la DEMO, que no necesita correo.
 */
export function isEmailRateLimited(error: AuthErrorLike): boolean {
  if (!error) return false;
  return error.code === "over_email_send_rate_limit";
}
