/**
 * Por qué alguien no ve un recurso, contado desde SU sesión y no desde el recurso.
 *
 * El servidor responde igual en los tres casos posibles —no existe, existe y no
 * participas, o lo creó otra sesión DEMO— y así debe seguir: distinguirlos en la
 * respuesta convertiría el 404 en un oráculo para averiguar qué Pactos existen.
 *
 * Lo que sí se puede decir sin filtrar nada es en qué sesión está quien mira, porque
 * eso es información suya. Es justo lo que faltaba: un evaluador en Modo Juez o en una
 * sesión DEMO nueva leía «Pacto no disponible» y concluía que PACTO estaba roto, cuando
 * lo que ocurría es que el Pacto pertenece a otra identidad.
 */

export type Viewer = "loading" | "judge" | "demo" | "account" | "anonymous";

export function explainViewer(
  judgeMode: boolean,
  user: { is_anonymous?: boolean } | null,
): Exclude<Viewer, "loading"> {
  if (judgeMode) return "judge";
  if (!user) return "anonymous";
  return user.is_anonymous ? "demo" : "account";
}
