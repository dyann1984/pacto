# Lista de verificación para la entrega

**Concurso:** PayPal AI Hackathon · https://paypalaihackathon.devpost.com

## Reglas oficiales — VERIFICADAS

Leídas directamente de `paypalaihackathon.devpost.com/rules` el **10 de octubre
de 2026**. (Devpost bloquea la descarga automática con HTTP 403; se consultaron
con un navegador real.) Vuelve a contrastarlas antes de enviar: el organizador
puede modificarlas.

| Dato | Valor oficial |
|---|---|
| Periodo de entrega | 1 oct 2026, 9:15 PT → **12 nov 2026, 12:00 PT** |
| Evaluación | 1 dic 2026, 14:00 PT → 15 dic 2026, 8:00 PT |
| Ganadores | Alrededor del 21 dic 2026 |
| Patrocinador / Administrador | PayPal Inc. / Devpost Inc. |
| Premios | 1º $12 000 · 2º $8 000 · 3º $5 000 · cinco menciones de $5 000 · premios de patrocinadores |

**Elegibilidad.** Personas mayores de edad en su lugar de residencia, equipos y
organizaciones. Quedan excluidos los residentes de Brasil, Quebec, Rusia, Crimea,
Cuba, Irán, Corea del Norte y cualquier territorio sancionado integralmente por la
OFAC. México no está excluido.

**Qué hay que construir.** Una aplicación que integre la plataforma de
desarrolladores de PayPal (entorno Sandbox gratuito) **junto con** una herramienta,
modelo o plataforma de IA a elección. Cualquier IA vale, siempre que *la
integración con PayPal sea central en el proyecto*.

**Proyectos nuevos y existentes.** Si el proyecto existía antes del periodo de
entrega, debe haberse actualizado de forma significativa durante él, y hay que
explicarlo. → *PACTO no necesita esa explicación: el primer commit es del 2 de
octubre de 2026, un día después de abrirse el periodo. El proyecto es íntegramente
nuevo.*

### Requisitos de la entrega (literales)

| # | Requisito | Estado en PACTO |
|---|---|---|
| 1 | Proyecto que cumpla los requisitos anteriores | ✅ |
| 2 | Descripción de texto con funciones y funcionalidad | ✅ `en/PROJECT_DESCRIPTION.md` |
| 3 | Demo funcional: URL alojada **o** instrucciones completas en el repositorio. Las maquetas no cuentan | ⚠️ URL alojada **desactualizada** (ver abajo) |
| 4 | Repositorio **público** en GitHub/GitLab/Bitbucket, con **archivo de licencia de código abierto** detectable y visible en la sección *About* | ❌ **Repositorio privado y sin licencia** |
| 5 | Vídeo de **menos de 3 minutos**, público en **YouTube** | ❌ **Sin grabar** · guion en `VIDEO_SCRIPT.md` |
| 6 | Todo el material en **inglés** (o con traducción al inglés) | ⚠️ Parcial: ver `submission/en/` |
| 7 | Acceso libre y gratuito para probar hasta el fin de la evaluación, con credenciales de prueba si hiciera falta | ✅ No hacen falta credenciales: Modo Juez y DEMO anónima |
| 8 | Sección de herramientas: qué modelo o servicio de IA se usó y cómo | ✅ `en/PROJECT_DESCRIPTION.md`, `AI_INTEGRATION.md` |

### Criterios de evaluación (los cinco pesan igual)

| Criterio | Cómo responde PACTO | Riesgo |
|---|---|---|
| **Technological Implementation** — ¿usa a fondo y con destreza la plataforma de PayPal y la IA? ¿Es una implementación real y no trivial? | PayPal Orders v2 con idempotencia, captura y webhooks verificados que fallan cerrados; IA con esquema estricto y huella SHA-256 de la entrada | **Alto si siguen sin credenciales:** el jurado vería un aviso de «no activado» justo en los dos puntos que se evalúan |
| **Design** — ¿es un producto completo y coherente, no una prueba de concepto? | Recorrido de cinco pasos, guía de «qué sigue» en cada pantalla, responsive, estados de carga y error | Bajo |
| **Potential Impact** — ¿plantea un problema real de un público real y lo resuelve? | Comercio entre pequeños negocios por mensajería informal; pago contra evidencia autorizada | Bajo |
| **Innovation/Idea** — ¿es creativo y distinto? | La autorización humana explícita como puerta del pago, impuesta por la base de datos y no por la interfaz; Modo Juez | Bajo |
| **Presentation** — ¿el vídeo demuestra el proyecto funcionando de extremo a extremo? | Guion listo | **Alto: el vídeo no está grabado** |

---

## Requisito de fondo: PayPal + IA

| Elemento | Estado | Evidencia |
|---|---|---|
| Integración con el API de PayPal (Sandbox) | Implementada; **inerte sin credenciales** | `src/lib/paypal.ts`; 14/14 pruebas |
| Órdenes, captura, estado y webhooks firmados | Implementado y probado con dobles | `tests/paypal.test.ts` |
| Integración con un modelo de IA | Implementada; **inerte sin clave** | `src/lib/ai.ts`; 9/9 pruebas |
| La IA aporta valor real | Sí: revisa el acuerdo antes de que nadie se comprometa | `AI_INTEGRATION.md` |
| Uso significativo, no decorativo | Sí: la IA revisa y PayPal liquida, dentro del mismo recorrido | `en/JUDGE_INSTRUCTIONS.md` |

---

## Bloqueos reales para la entrega

Ordenados por impacto en la puntuación. Los cuatro primeros requieren una
decisión o una credencial de la propietaria; ninguno requiere tocar el código.

1. **El despliegue público está desactualizado.** `https://pacto-pearl.vercel.app`
   sirve el commit `dd94565`, anterior a los hitos, a los pagos con PayPal y al
   Modo Juez. **`/juez` responde 404 en producción.** Un juez que siga
   `DEMO_GUIDE.md` se topa con una página inexistente. Hay que desplegar
   `feat/paypal-ai-demo` (`2c406ab`).
2. **Repositorio privado y sin licencia.** La regla 4 lo exige público y con
   licencia de código abierto visible. Es motivo de descalificación.
3. **Sin clave de Anthropic.** El panel de IA muestra «no activado» — en el
   criterio que más pesa.
4. **Sin credenciales de PayPal Sandbox.** El pago muestra «no activado», en ese
   mismo criterio.
5. **Vídeo sin grabar.** Guion en `VIDEO_SCRIPT.md`, pendiente de actualizar para
   usar el Modo Juez, que es la forma más clara de enseñar el ciclo completo.
6. **Capturas de pantalla.** Siete capturas reales del recorrido en
   `test-results/juez-*.png`, generadas por `tests/e2e/shots.spec.ts`. Faltan las
   de IA y PayPal, que no deben recrearse ni simularse.

## Estado de la verificación técnica (10 oct 2026)

| Comprobación | Resultado |
|---|---|
| `pnpm test` | **152/152** (unitarias, autorización y RLS contra PostgreSQL real) |
| `pnpm exec playwright test` | **24 pasan, 9 omitidas** (las omitidas necesitan credenciales DEMO) |
| `pnpm build` | ✅ compila, con TypeScript en modo estricto |
| `pnpm lint` | ✅ sin errores |
| Recorrido completo en navegador, Modo Juez | ✅ crear → invitar → unirse → aceptar ×2 → evidencia → autorizar → cerrar |
| Recorrido completo contra la base de datos real | ✅ incluidas las negativas: el proveedor no puede aprobar su propio hito |

## Decisiones que requieren a la propietaria

1. **Hacer público el repositorio** `dyann1984/pacto`. Lo exige la regla 4.
2. **Licencia.** Añadir un `LICENSE` de código abierto (MIT es lo habitual) con el
   titular del copyright.
3. **Desplegar a producción** la rama con PayPal y Modo Juez.
4. **Clave de Anthropic.** Con `claude-haiku-5-5` el coste ronda los 2 USD por mil
   análisis.
5. **Credenciales de PayPal Sandbox** y el `PAYPAL_WEBHOOK_ID` del webhook
   apuntando a `https://<dominio>/api/paypal/webhook`.
6. **Grabar y publicar el vídeo** en YouTube, en visibilidad pública.
