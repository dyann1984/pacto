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
| 3 | Demo funcional: URL alojada **o** instrucciones completas en el repositorio. Las maquetas no cuentan | ✅ https://pacto-pearl.vercel.app, al día y verificada |
| 4 | Repositorio **público** en GitHub/GitLab/Bitbucket, con **archivo de licencia de código abierto** detectable y visible en la sección *About* | ❌ **Repositorio privado y sin licencia** |
| 5 | Vídeo de **menos de 3 minutos**, público en **YouTube** | ❌ **Sin grabar** · guion en `VIDEO_SCRIPT.md` |
| 6 | Todo el material en **inglés** (o con traducción al inglés) | ⚠️ Parcial: ver `submission/en/` |
| 7 | Acceso libre y gratuito para probar hasta el fin de la evaluación, con credenciales de prueba si hiciera falta | ✅ No hacen falta credenciales: Modo Juez y DEMO anónima |
| 8 | Sección de herramientas: qué modelo o servicio de IA se usó y cómo | ✅ `en/PROJECT_DESCRIPTION.md`, `AI_INTEGRATION.md` |

### Criterios de evaluación (los cinco pesan igual)

| Criterio | Cómo responde PACTO | Riesgo |
|---|---|---|
| **Technological Implementation** — ¿usa a fondo y con destreza la plataforma de PayPal y la IA? ¿Es una implementación real y no trivial? | PayPal Orders v2 con idempotencia, captura y webhooks verificados que fallan cerrados; IA con esquema estricto y huella SHA-256 de la entrada | **Alto si siguen sin credenciales:** el jurado vería un aviso de «no activado» justo en los dos puntos que se evalúan |
| **Design** — ¿es un producto completo y coherente, no una prueba de concepto? | Recorrido de seis pasos, guía de «qué sigue» en cada pantalla, responsive, estados de carga y error | Bajo |
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

1. ~~El despliegue público está desactualizado.~~ **Resuelto el 10 oct 2026.**
   `production` apunta a `9041273`; `/juez` responde 200 y el recorrido completo
   se verificó con Playwright contra producción.
2. **Repositorio privado y sin licencia visible.** La licencia MIT ya está en el
   repositorio (`LICENSE`); falta **hacerlo público**. La regla 4 lo exige y es
   motivo de descalificación. Requiere la autorización de la propietaria.
3. **Sin clave de Anthropic.** El panel de IA muestra «no activado» — en el
   criterio que más pesa.
4. **Sin credenciales de PayPal Sandbox.** El pago muestra «no activado», en ese
   mismo criterio.
5. **Vídeo sin grabar.** Guion actualizado en `VIDEO_SCRIPT.md`, ya reescrito
   alrededor del Modo Juez y con los tiempos ajustados a menos de 3 minutos.
6. **Capturas de pantalla.** Siete capturas reales del recorrido se generan con
   `PACTO_E2E_SHOTS=1 pnpm exec playwright test tests/e2e/shots.spec.ts`. Faltan
   las de IA y PayPal, que no deben recrearse ni simularse.

## Estado de la verificación técnica (10 oct 2026)

| Comprobación | Resultado |
|---|---|
| `pnpm test` | **159/159** (unitarias, autorización y RLS contra PostgreSQL real) |
| `pnpm exec playwright test` | **26 pasan, 0 fallan, 10 omitidas** (9 necesitan credenciales DEMO; 1 son las capturas, bajo demanda) |
| Recorrido completo **contra producción** | ✅ Modo Juez entero con Playwright sobre `pacto-pearl.vercel.app` |
| `pnpm build` | ✅ compila, con TypeScript en modo estricto |
| `pnpm lint` | ✅ sin errores |
| `pnpm check:secrets` | ✅ ningún secreto en el bundle de cliente ni en el repositorio |
| `pnpm check:integrations` | ⚠️ Supabase vivo y con accesos anónimos activos; 4 credenciales ausentes |
| Recorrido completo en navegador, Modo Juez | ✅ crear → invitar → unirse → aceptar ×2 → evidencia → autorizar → cerrar |
| Recorrido completo contra la base de datos real | ✅ incluidas las negativas: el proveedor no puede aprobar su propio hito |

> **Sobre el cupo de sesiones anónimas.** Supabase limita los accesos anónimos a
> 30 por hora y por IP. La suite E2E crea unas 19, así que cabe **una ejecución
> por hora**. Dos seguidas agotan el cupo y las pruebas fallan con «Demasiadas
> sesiones de prueba en la última hora»: es el límite, no una regresión. Conviene
> subirlo en el panel de Supabase durante el periodo de evaluación
> (`docs/deployment.md`).

## Decisiones que requieren a la propietaria

1. **Hacer público el repositorio** `dyann1984/pacto`. Lo exige la regla 4. El
   `LICENSE` (MIT) ya está dentro; falta el cambio de visibilidad, que expone
   todo el historial y por eso no se hace sin autorización.
   → GitHub → *Settings* → *General* → abajo del todo, *Danger Zone* →
   *Change repository visibility* → **Make public**.
2. **Revisar el titular del copyright** en `LICENSE`: dice `dyann1984`. Si
   prefieres tu nombre legal, cámbialo antes de hacerlo público.
3. **Clave de Anthropic.** Con `claude-haiku-5-5` el coste ronda los 2 USD por mil
   análisis. Pasos en `../docs/credentials-setup.md`.
4. **Credenciales de PayPal Sandbox** y el `PAYPAL_WEBHOOK_ID` del webhook
   apuntando a `https://pacto-pearl.vercel.app/api/paypal/webhook`.
5. **Grabar y publicar el vídeo** en YouTube, en visibilidad pública.
6. **Enviar la inscripción** en Devpost. No se hará sin tu confirmación expresa.

Ya hecho: el despliegue a producción está al día y verificado.
