# Integración de inteligencia artificial

## Proveedor y modelo

- **Proveedor:** API de Anthropic (`POST /v1/messages`), llamada directa con
  `fetch` desde el servidor.
- **Modelo por defecto:** `claude-sonnet-5-5`, configurable con `ANTHROPIC_MODEL`.
- **Dónde vive:** `src/lib/ai.ts` (transporte) y `src/domain/agreement-analysis.ts`
  (construcción del aviso y validación de la respuesta).

## Qué hace

Analiza el alcance y los importes de una versión del acuerdo **antes** de que las
partes se comprometan, y devuelve:

- un **resumen** comprensible de lo que el acuerdo dice realmente;
- una lista de **hallazgos**, cada uno con categoría (`AMBIGUITY`, `OBLIGATION`,
  `DATE`, `RISK`, `INCONSISTENCY`), prioridad, la **cita literal** del texto que
  lo provoca, una explicación y una sugerencia de mejora;
- sus propios **límites**, que se muestran junto al resultado.

Las categorías cubren lo que pide el enunciado: claridad, riesgos, condiciones
ambiguas, información faltante y propuestas de mejora.

## Qué NO hace, por diseño

La IA **no puede** cambiar el acuerdo, aceptar en nombre de nadie, confirmar un
cierre ni autorizar un pago. No es una promesa redactada: la función de servidor
que la invoca solo tiene permiso para escribir en `ai_analyses`, y pagar exige que
una persona haya puesto el hito en `APPROVED`. No existe ninguna ruta de código
por la que un texto generado llegue a mover dinero.

El resultado se presenta siempre como asistencia, no como asesoría legal
definitiva, y el aviso del sistema se lo indica al modelo explícitamente.

## Seguridad

- **Inyección de instrucciones:** el alcance del acuerdo lo escribe la otra parte,
  así que es dato no confiable. Va dentro de un bloque delimitado del mensaje de
  usuario, nunca en el aviso del sistema, y la salida **no se interpreta como
  instrucciones**: se valida contra un esquema estricto con Zod. Cualquier
  respuesta que no encaje se rechaza con `INVALID_OUTPUT` y no se muestra nada.
- **Validación de entrada:** el alcance está limitado a 5000 caracteres por la
  base de datos; los importes son enteros acotados.
- **Trazabilidad:** cada análisis se guarda con el modelo usado y un SHA-256 de la
  entrada, de modo que se puede comprobar a qué texto correspondía.
- **Sin filtración de secretos:** los errores se reducen a códigos cortos como
  `PROVIDER_HTTP_429`; nunca se registra la clave ni el cuerpo de la respuesta.

## Control de costes

- **Límite de 3 análisis por versión del acuerdo**, comprobado en el servidor
  antes de llamar al proveedor. Importa porque cualquier visitante DEMO anónimo
  puede pulsar el botón.
- **`max_tokens` de 16 000.** Los modelos actuales razonan antes de responder y
  ese razonamiento cuenta como salida; con el valor anterior (2000) el JSON podía
  llegar cortado. Se factura solo lo generado, no el máximo.
- **Tiempo de espera de 90 segundos**, con el error tratado como fallo normal.
- **Negativas y respuestas cortadas** (`stop_reason` `refusal` o `max_tokens`) se
  tratan como error, nunca se presentan como un análisis.

Coste aproximado por análisis con un acuerdo típico (≈1500 tokens de entrada):

| Modelo | Entrada / salida por millón | Por análisis |
|---|---|---|
| `claude-haiku-5-5` | $0.10 / $0.50 | ≈ $0.001–0.002 |
| `claude-sonnet-5-5` (actual) | $2 / $10 | ≈ $0.02–0.04 |
| `claude-opus-5-5` | $4 / $20 | ≈ $0.04–0.08 |

## Estado actual: implementado, no activado

**No hay `ANTHROPIC_API_KEY` configurada en ningún entorno**, por decisión expresa
de la propietaria de no generar gasto durante el concurso.

Consecuencia visible: donde estaría el botón de análisis, la interfaz explica que
la función no está activada. **No se generan resultados simulados ni se presentan
como reales.** Un análisis que aparezca en pantalla salió del proveedor.

### Qué falta para una demostración real

1. Crear una clave en console.anthropic.com con crédito de prepago.
2. Añadir `ANTHROPIC_API_KEY` en Vercel como *Sensitive*, **nunca** con prefijo
   `NEXT_PUBLIC_`. Opcionalmente `ANTHROPIC_MODEL=claude-haiku-5-5` para abaratar.
3. Fijar un límite de gasto en la consola de Anthropic.

No hace falta ningún cambio de código ni una migración.

## Estado de las pruebas

| Prueba | Tipo | Resultado |
|---|---|---|
| Construcción del aviso y huella SHA-256 de la entrada | Unitaria | PASS |
| Validación estricta de la salida; rechazo de JSON inválido | Unitaria | PASS |
| Sin clave configurada devuelve `NOT_CONFIGURED`, no un resultado falso | Unitaria | PASS |
| Error del proveedor se convierte en código corto (`PROVIDER_HTTP_401`) | Doble del API | PASS |
| La interfaz explica que no está activa en vez de ofrecer el botón | Extremo a extremo | PASS |
| Análisis real contra la API de Anthropic | Proveedor real | **NO EJECUTADA** (falta la clave) |
