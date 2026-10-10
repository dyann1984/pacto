# Auditoría del flujo completo — 10 de octubre de 2026

Alcance: creación → invitación → unión → revisión → aceptación bilateral → entrega →
pago → cierre. Persistencia, RLS, roles, auditoría, idempotencia, PayPal Sandbox y
análisis con IA.

Punto de partida: prueba manual del acuerdo «Rediseño de tienda en línea» por
$25,000 MXN en <https://pacto-pearl.vercel.app>.

**Recomendación: NO-GO hasta aplicar la migración 8 en Supabase. Después, GO para el
concurso (DEMO + PayPal Sandbox); NO-GO para dinero real.** Detalle al final.

---

## 1. Errores reproducidos

### E-1 · Un Pacto se cerraba sin que existiera entrega — CRÍTICO

**Reproducido** sobre el esquema real (migraciones 1-7 en PostgreSQL embebido):

```
estado del hito antes del cierre: PENDING
REPRO 1 cierre sin entrega -> CONFIRMED / CLOSED
  estado del Pacto: CLOSED
  estado del hito : PENDING
```

**Causa raíz.** `confirm_closure` (migración `202610080001`) se escribió antes de que
existieran los hitos con evidencia (migración `202610120001`) y nunca se actualizó. Sus
guardas eran: participante, Pacto `ACTIVE`, ninguna propuesta en `DRAFT`/`REVIEW` y un
acuerdo `ACCEPTED`. Ninguna mira `milestones.status`. Con el acuerdo aceptado, ambas
partes podían confirmar el cierre con el hito en `PENDING`.

Esto explica literalmente lo observado: **«La sección de entregas mostró "Pendiente de
entrega" durante el recorrido de cierre»**. No era un desfase de la interfaz: el Pacto se
cerraba de verdad con la entrega sin hacer. Y era irreversible, porque un Pacto cerrado
no admite cambios (`PACTO_NOT_ACTIVE`), así que el hito quedaba `PENDING` para siempre.

Agravante de producto: `nextStep` ofrecía «Confirmar cierre» en cuanto el acuerdo estaba
aceptado, y el stepper tenía 5 etapas sin ninguna para la entrega. La interfaz invitaba
activamente a usar la transición inválida.

**Corregido.** Nueva migración `202610130001_closure_requires_delivery.sql`: el cierre
exige que **cada hito del acuerdo aceptado esté `APPROVED` o `PAID`** (código
`DELIVERY_REQUIRED`). No exige el pago: PACTO no es escrow y el cierre nunca libera
fondos, así que exigirlo bloquearía el cierre en cualquier entorno sin PayPal.

### E-2 · El proveedor podía declarar un cobro de PayPal que nunca ocurrió — CRÍTICO (seguridad)

**Reproducido:**

```
REPRO 2 proveedor declara captura -> CAPTURED
  estado del hito: PAID
```

**Causa raíz.** `record_payment_result` autorizaba por pertenencia al Pacto
(`is_participant`), no por rol ni por origen:

```sql
if v_actor is null then v_actor := v_p.created_by;
elsif not public.is_participant(v_p.pacto_id) then raise exception 'NOT_FOUND';
end if;
```

La RPC está concedida a `authenticated`, y el proveedor ve `payments.order_id` por RLS
(`member_payments`) y en el tablero de hitos. Con la clave pública y su propia sesión
podía llamar a PostgREST directamente con `p_status='CAPTURED'` y un `capture_id`
inventado: el hito pasaba a `PAID` y la auditoría registraba `PAYMENT_CAPTURED` con un
comprobante falso. El comprador podía hacer lo mismo, que es el escenario con incentivo
real: hacer creer al proveedor que se le pagó.

Rompe dos cosas a la vez: la separación de permisos comprador/proveedor (misión 5) y la
veracidad del registro de pagos (misión 6).

**Corregido** en la misma migración. Una captura es un hecho externo, así que solo la
afirma el servidor:

- con sesión de usuario, solo quien creó la orden puede tocarla (para el resto la orden
  «no existe»: `NOT_FOUND`), y únicamente para abandonarla (`FAILED`/`CANCELLED`);
- `CAPTURED` desde una sesión de usuario se rechaza con `CAPTURE_NOT_ALLOWED`;
- la captura la escribe el servidor sin sesión, con el rol de servicio, después de
  verificarla contra PayPal (retorno del pagador) o de recibir un webhook con firma
  válida. El actor auditado sigue siendo quien creó la orden, no un usuario nulo.

### E-3 · «Pacto no disponible» — ALTO (confianza del evaluador, no defecto de seguridad)

**Reproducido** y clasificado. El 404 es **correcto y deliberado**: `getPacto` devuelve
`null` y la página llama a `notFound()`. Lo que estaba mal es que una sola frase cubría
tres situaciones distintas:

1. el Pacto no existe;
2. existe y quien mira no es participante;
3. existe y lo creó **otra identidad DEMO** — otra sesión anónima, la otra identidad del
   Modo Juez, o un recorrido reiniciado.

El caso 3 es el que vio la prueba manual, y es el más probable para un juez: cada entrada
a `/demo` o a `/juez` crea sesiones anónimas nuevas con su propio `auth.uid()`, y RLS las
aísla igual que a dos personas distintas. `tests/e2e/judge.spec.ts` ya afirmaba este
comportamiento como intencionado («el escenario anterior pertenece a otra identidad»).
El problema era de comunicación: quien evalúa leía «Pacto no disponible» y concluía que
PACTO está roto.

**Corregido sin filtrar nada.** La respuesta del servidor sigue siendo idéntica en los
tres casos —distinguirlos convertiría el 404 en un oráculo de qué Pactos existen—. Lo
que se añade es una explicación de **la sesión de quien mira**, que es información suya y
no del recurso: Modo Juez, sesión DEMO, cuenta real o sin sesión. En Modo Juez el 404
incluye además el botón para cambiar de identidad y volver a intentarlo.

### E-4 · «El análisis con IA indica que no está activado» — no es un defecto

El módulo está completo y probado: prompt con defensa contra inyección (instrucciones
dentro de `<acuerdo>` se ignoran explícitamente), salida validada con Zod, hash del
input para trazabilidad, tope de 3 análisis por versión para acotar el coste, y registro
auditado vía `record_ai_analysis`. 9 pruebas lo cubren.

**Causa raíz: falta la credencial.** `isAnalysisConfigured()` devuelve
`Boolean(process.env.ANTHROPIC_API_KEY)` y la clave no está configurada. Verificado en
este entorno:

```
── Análisis con IA (Anthropic) ───────────────────────────────
  FALTA    ANTHROPIC_API_KEY: el panel de análisis mostrará «no activado»
```

La interfaz hace lo correcto: explica que no está activo en vez de ofrecer un botón que
fallaría, y no inventa hallazgos. **No he implementado nada nuevo ni he podido probar el
análisis contra el proveedor real: sin clave no hay resultado que reportar, y no voy a
afirmar que funciona sin haberlo visto funcionar.** Para activarlo: `ANTHROPIC_API_KEY`
en Vercel (nunca con prefijo `NEXT_PUBLIC_`) y después
`node --env-file=.env.local scripts/check-integrations.mjs`, que hace una llamada real.

### E-5 · «No se ha comprobado una transacción completa de PayPal Sandbox» — BLOQUEADO

**No he podido comprobarla y no la doy por buena.** En este entorno no hay credenciales
de PayPal:

```
── PayPal (Sandbox) ──────────────────────────────────────────
  FALTA    PAYPAL_CLIENT_ID y/o PAYPAL_CLIENT_SECRET
  FALTA    PAYPAL_WEBHOOK_ID
```

Lo que **sí** está verificado por pruebas, sin tocar PayPal:

- el host está fijado a Sandbox incluso si se configura el de producción —
  `apiBase()` ignora `PAYPAL_API_BASE`, así que el código no puede generar cobros reales;
- idempotencia en PayPal mediante `paypal-request-id` (la orden usa el id del hito; la
  captura, `capture-<orderId>`);
- idempotencia en la base: índice único `one_open_payment_per_milestone` (como máximo un
  pago vivo por hito) y `order_id` único; repetir una captura devuelve `ALREADY_CAPTURED`
  sin duplicar pago ni auditoría;
- el importe nunca viene del formulario: se lee del hito y la RPC vuelve a comprobarlo
  (`AMOUNT_MISMATCH`);
- la firma del webhook se verifica contra PayPal y **falla cerrado**: sin
  `PAYPAL_WEBHOOK_ID`, sin cabeceras, con JSON inválido o si la propia verificación
  falla, el aviso se descarta;
- nunca se registra el cuerpo de una respuesta de PayPal: solo códigos cortos
  (`ORDER_HTTP_422`), para no filtrar datos del pagador.

Lo que queda por comprobar con credenciales reales está en el apartado 6.

---

## 2. Revisión de persistencia, RLS, roles, auditoría e idempotencia

Sin hallazgos nuevos más allá de E-1 y E-2. Lo comprobado:

- **RLS activa en todas las tablas**, sin un solo `grant` de escritura a `anon` ni a
  `authenticated`: toda mutación pasa por RPC `security definer` con `search_path=''`.
  Fijado por pruebas en cada migración.
- **`anon` no tiene nada**: ni `SELECT` sobre `pactos`, ni ejecución de ninguna RPC.
- **Aislamiento entre participantes** correcto: el intruso no ve Pactos, acuerdos,
  hitos, criterios, aceptaciones, auditoría, invitaciones, pagos ni análisis, y
  `milestone_board` le devuelve cero filas.
- **Separación de roles comprador/proveedor** (misión 5), ahora completa:
  solo el proveedor presenta evidencia; solo el comprador autoriza, y solo con evidencia
  previa (`EVIDENCE_REQUIRED`); el proveedor no puede crear una orden de pago de su
  propio hito ni —tras E-2— tocar la del comprador.
- **Invitaciones**: en la base solo vive el SHA-256 del token, de un solo uso, caducidad
  de 7 días, revocación de las anteriores al generar una nueva, y la restricción por
  correo se comprueba **antes** de revelar título, alcance o importe.
- **Auditoría**: sin `grant` de escritura; cada RPC inserta su propio evento. La captura
  idempotente no reescribe el registro.
- **Identidades distintas obligatorias**: `DISTINCT_PARTIES_REQUIRED` impide que una
  misma cuenta sea las dos partes, también en Modo Juez (verificado en vivo: dos
  `auth.uid()` reales y separados).
- **Reversibilidad**: añadido un guardia a la reversa de pagos. Retirar
  `milestones.status` mientras la regla de entrega siga aplicada dejaría
  `confirm_closure` roto en ejecución, sin aviso; ahora se niega con
  `ROLLBACK_OUT_OF_ORDER` y obliga al orden inverso correcto.

---

## 3. Archivos modificados

**Esquema**

| Archivo | Cambio |
|---|---|
| `supabase/migrations/202610130001_closure_requires_delivery.sql` | **nuevo** · corrige E-1 y E-2. No crea objetos ni permisos: reemplaza dos cuerpos de RPC |
| `supabase/rollback/202610130001_closure_requires_delivery.down.sql` | **nuevo** · restaura los cuerpos anteriores |
| `supabase/rollback/202610120001_milestones_payments.down.sql` | guardia `ROLLBACK_OUT_OF_ORDER` |
| `supabase/preflight.sql` | dos filas nuevas que detectan la migración 8 por el cuerpo de las funciones |

**Aplicación**

| Archivo | Cambio |
|---|---|
| `src/domain/journey.ts` | etapa «Entrega autorizada» en el stepper (6 pasos); `DeliveryProgress`, `deliveryComplete`, acción `deliver`; el cierre deja de ofrecerse antes de la entrega |
| `src/domain/access.ts` | **nuevo** · `explainViewer`: decide la explicación del 404 mirando solo la sesión propia |
| `src/components/access-explainer.tsx` | **nuevo** · explicación del 404 por tipo de sesión |
| `src/app/not-found.tsx` | usa el explicador y la barra del Modo Juez; misma respuesta para las tres causas |
| `src/app/pactos/[id]/page.tsx` | calcula el avance de entregas; mensaje `DELIVERY_REQUIRED`; `conciliacion` y `CAPTURE_NOT_ALLOWED`; `paypalReady` exige poder registrar el cobro |
| `src/app/pactos/[id]/pago/page.tsx` | la captura se registra con el rol de servicio; sin conciliación se dice la verdad en vez de afirmar un cobro |
| `src/app/pactos/actions.ts` | códigos nuevos; `startPayment` no abre un cobro que no podría registrar |
| `src/lib/supabase-service.ts` | `isSettlementConfigured()` |
| `src/components/milestone-board.tsx` | ancla `#entregas` para el paso «Ir a Entregas y pagos» |

**Pruebas y documentación**

`tests/closure-delivery.rls.test.ts` (nuevo, 7), `tests/paypal-webhook.test.ts` (nuevo,
9), `tests/access-explainer.test.ts` (nuevo, 5), `tests/payments.rls.test.ts` (+3),
`tests/migrations.test.ts` (+3), `tests/journey.test.ts` (+5),
`tests/e2e/flows.spec.ts`, `tests/e2e/judge.spec.ts`, `docs/credentials-setup.md`,
`docs/supabase-migrations.md`.

---

## 4. Pruebas realizadas y resultados

| Comprobación | Resultado |
|---|---|
| `eslint .` | 0 errores (1 aviso preexistente en un script local sin versionar) |
| `next typegen && tsc --noEmit` | limpio |
| `vitest run` | **190/190** en 21 archivos (antes: 159 en 18) |
| `next build --webpack` | correcto, 17 rutas |
| `scripts/check-public-exposure.mjs` | sin secretos en el bundle ni en el repositorio |
| `scripts/check-integrations.mjs` | Supabase vivo con accesos anónimos activos; PayPal, IA y rol de servicio ausentes |
| Recorrido completo en el navegador, build local | ver abajo |

**Pruebas nuevas, por lo que fijan**

- `closure-delivery.rls.test.ts`: ninguna parte cierra con el hito `PENDING`; la
  evidencia sola no basta; con el hito autorizado ambas cierran; un hito pagado también
  permite cerrar; la regla no relaja ninguna comprobación anterior (un extraño sigue
  recibiendo `NOT_FOUND` y una propuesta pendiente sigue teniendo prioridad); una
  revisión del acuerdo vuelve a exigir la entrega de la versión nueva; la migración no
  concede ningún permiso.
- `payments.rls.test.ts`: nadie declara una captura desde una sesión de usuario, ni
  siquiera el pagador, y el intento no deja rastro; solo quien creó la orden puede
  abandonarla; el servidor sin sesión registra la captura, es idempotente, audita al
  creador de la orden y no permite revertir a `FAILED` después de capturar.
- `paypal-webhook.test.ts`: un aviso sin firma verificada devuelve 401 y no escribe nada;
  una captura verificada se registra contra la orden que PACTO creó; `DENIED`/`REVERSED`
  marcan fallo; los avisos informativos no cambian estados; sin conciliación configurada
  se reconoce sin escribir; un fallo de escritura responde 200 para no invitar a
  reintentos infinitos.
- `access-explainer.test.ts`: cada tipo de sesión recibe su explicación, y dos pruebas
  verifican por inspección del código que ni el explicador ni el 404 leen nada del
  recurso.

**Recorrido completo verificado en vivo** (build local, Modo Juez, dos sesiones
anónimas reales de Supabase):

1. Pacto creado — el stepper muestra ya 6 etapas, con «5 Entrega autorizada».
2. Invitación generada, proveedor unido, acuerdo enviado y aceptado por ambas partes.
3. **En el punto exacto del defecto**: no hay botón «Confirmar cierre». En su lugar,
   «Esperando la entrega del proveedor», y el hito dice «Pendiente de entrega» de forma
   coherente con el paso en curso.
4. Como proveedor: «Registra lo que entregaste» con enlace a la sección; evidencia
   presentada.
5. Como cliente: evidencia visible y auditada; hito autorizado → «✓ Entrega autorizada»
   y entonces sí aparece «Confirma el cierre».
6. Ambas partes confirman → Pacto **Cerrado**, las 6 etapas en ✓, y la sección de
   entregas muestra «Autorizado para pago» con la evidencia. **El síntoma reportado
   desaparece.**
7. 404 en Modo Juez: «Estás en Modo Juez, con dos identidades DEMO», con la indicación de
   cambiar de identidad y el botón para hacerlo. Sin rastro del título ni del contenido.
8. PayPal: «todavía no está activado», correcto sin credenciales.
9. Consola y registros del servidor sin errores (solo el aviso conocido de
   `Multiple GoTrueClient instances`, documentado y no funcional).

**Restricciones respetadas:** ningún secreto en el reporte ni en los registros; ningún
pago real ni simulado; ningún dato de usuario real modificado (solo sesiones DEMO
anónimas creadas por el propio recorrido); nada desplegado ni confirmado en git.

---

## 5. Pruebas que no se pudieron ejecutar

- **Las 9 pruebas E2E de `tests/e2e/flows.spec.ts`** se omiten: requieren
  `PACTO_DEMO_A_*`/`PACTO_DEMO_B_*`, vacías en este entorno. Las he actualizado para el
  nuevo flujo de entrega, pero **no se han ejecutado**.
- **Playwright no arranca en esta máquina**: la configuración fija el canal `msedge` en
  Windows y el proceso de Edge muere al lanzarse (`Target page, context or browser has
  been closed`) por el entorno, no por las pruebas. Por eso el recorrido se verificó
  conduciendo el navegador a mano, con el resultado del apartado 4.
- **Transacción completa en PayPal Sandbox**: sin credenciales. No comprobada.

---

## 6. Riesgos pendientes

| # | Riesgo | Gravedad | Qué hacer |
|---|---|---|---|
| R-1 | **La migración 8 no está aplicada en el proyecto Supabase.** Mientras no lo esté, E-1 y E-2 siguen abiertos en producción, por mucho que el código esté corregido | **Bloqueante** | Aplicarla como propietario en el SQL Editor y comprobar que el preflight queda todo en `true` |
| R-2 | **`SUPABASE_SERVICE_ROLE_KEY` pasa a ser obligatoria para los pagos.** Es la consecuencia directa de E-2: si el cobro solo lo afirma el servidor, necesita escribir sin sesión. Sin ella, PACTO no ofrece pagar y lo dice | Alta | Configurarla en Vercel como *Sensitive*. Es un cambio de requisitos de despliegue, no un fallo |
| R-3 | **Transacción de PayPal Sandbox sin comprobar de extremo a extremo** | Alta | Con credenciales: `check-integrations.mjs`, después una orden real con cuenta Sandbox, y verificar que llega `PAYMENT.CAPTURE.COMPLETED`, que el hito pasa a `PAID` y que repetir el aviso devuelve `ALREADY_CAPTURED` |
| R-4 | **Reembolsos y reversos no implementados.** No existe estado `REFUNDED` en `payments`. `PAYMENT.CAPTURE.REFUNDED` se reconoce y no revierte nada; un `REVERSED` posterior a la captura recibe `ALREADY_CAPTURED` y tampoco deja rastro. Un reembolso hecho en PayPal deja el hito como `PAID` | Media en Sandbox, **alta para dinero real** | Añadir el estado y su RPC. Fijado en pruebas para que implementarlo obligue a actualizarlas. **No lo he implementado: no puedo probarlo sin credenciales y preferí no dejar a medias una máquina de estados de dinero** |
| R-5 | **Análisis con IA inactivo** en el entorno desplegado | Media | `ANTHROPIC_API_KEY` en Vercel y verificar con `check-integrations.mjs` |
| R-6 | **Pactos ya cerrados con hitos en `PENDING`** (consecuencia de E-1 antes de la corrección) siguen así: `confirm_closure` solo actúa sobre Pactos `ACTIVE` y no he tocado datos existentes | Baja | Decisión de producto. Si hay que sanearlos, hacerlo por SQL directo y auditado |
| R-7 | **Pactos en vuelo, aceptados y sin entrega**, ya no se podrán cerrar sin evidencia y autorización. Es el comportamiento correcto, pero cambia lo que verá quien tenga uno a medias. No hay bloqueo: siempre queda cancelar con motivo | Baja | Nada; la interfaz lo explica paso a paso |
| R-8 | **Cupo horario de sesiones anónimas por IP.** Un juez que reintente varias veces puede agotarlo | Baja | Ya está bien explicado como espera y no como avería. Tenerlo en cuenta al demostrar |
| R-9 | `docs/supabase-migrations.md` estaba desactualizado (solo describía 2 de 8 migraciones). Actualizado | Resuelto | — |

---

## 7. Recomendación

**NO-GO ahora mismo.** No por el código, que está corregido, probado y construye
limpio, sino porque los dos defectos críticos viven en la base de datos: hasta que
`202610130001_closure_requires_delivery.sql` esté aplicada en el proyecto Supabase,
sigue siendo posible cerrar un Pacto sin entrega y marcar un hito como pagado sin que
PayPal haya cobrado.

**GO para el concurso** una vez hecho esto, en este orden:

1. Aplicar la migración 8 y dejar el preflight todo en `true` (**R-1**).
2. Configurar `SUPABASE_SERVICE_ROLE_KEY` en Vercel (**R-2**). Sin ella, los pagos se
   presentan honestamente como no activados y el resto del recorrido funciona completo.
3. Desplegar y repetir el recorrido del apartado 4 en producción.

Opcional y recomendable para la demostración, no bloqueante: `ANTHROPIC_API_KEY`
(**R-5**) y las credenciales de PayPal Sandbox con una transacción real comprobada
(**R-3**).

**NO-GO para dinero real**, y conviene decirlo sin rodeos aunque hoy no aplique: falta
la máquina de estados de reembolsos y reversos (**R-4**), y el host de PayPal está
fijado a Sandbox a propósito. PACTO no retiene fondos ni actúa como escrow; para operar
con dinero real haría falta, además de R-4, una revisión de cumplimiento que queda fuera
de esta auditoría.

**Lo que no afirmo:** que el pago en PayPal Sandbox funciona de principio a fin (no lo he
visto, R-3), que el análisis con IA produce hallazgos reales (no hay clave, E-4), ni que
las 9 pruebas E2E con cuentas DEMO pasan (no se ejecutaron, apartado 5).
