# Runbook · aplicar `202610130001_closure_requires_delivery.sql`

Corrige los dos defectos críticos de `docs/audit-report-2026-10-10.md`:

- **E-1**: un Pacto se cerraba con sus hitos en `PENDING` — sin evidencia, sin
  autorización y sin pago, de forma irreversible.
- **E-2**: cualquier participante con sesión podía declarar un cobro de PayPal que nunca
  ocurrió y dejar el hito en `PAID` con un comprobante inventado.

Proyecto: `qmfwilyarxnomyufnwwv` (`dyann1984's Project`).

> **Esta migración no se ha aplicado todavía.** Requiere la sesión de la propietaria en
> el SQL Editor de Supabase: es DDL (`create or replace function`) y ni la clave
> `publishable` ni la `service_role` pueden ejecutarla.

---

## Qué cambia exactamente

Nada de datos, nada de esquema, nada de permisos. Solo el **cuerpo** de dos funciones:

| Función | Cambio |
|---|---|
| `public.confirm_closure(uuid,text)` | nueva guarda: ningún hito del acuerdo aceptado puede estar fuera de `APPROVED`/`PAID` → `DELIVERY_REQUIRED` |
| `public.record_payment_result(text,text,text)` | con sesión de usuario, solo quien creó la orden puede tocarla y nunca con `CAPTURED` → `CAPTURE_NOT_ALLOWED`. La captura solo la escribe el servidor sin sesión |

Verificado sobre el esquema real: los permisos (`ACL`) de ambas funciones quedan
idénticos antes y después, `security definer` y `search_path=""` se conservan, y no hay
ninguna referencia sin cualificar por esquema.

**Ningún Pacto existente se modifica.** `confirm_closure` solo actúa sobre Pactos
`ACTIVE`, así que los ya cerrados quedan como están.

---

## Paso 0 · Respaldo

El cambio no toca datos, así que el respaldo relevante es el **cuerpo actual de las dos
funciones**. En el SQL Editor, guarda la salida de:

```sql
select p.proname,
       pg_get_functiondef(p.oid) as definicion_actual,
       coalesce(array_to_string(p.proacl::text[], ' | '), '(por defecto)') as permisos
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('confirm_closure', 'record_payment_result')
order by p.proname;
```

Copia el resultado a un archivo local antes de seguir. Con eso, más
`supabase/rollback/202610130001_closure_requires_delivery.down.sql`, la reversión está
cubierta por dos caminos independientes.

Comprueba además, en **Supabase → Database → Backups**, que existe una copia reciente
del proyecto. No se espera necesitarla —no se borra ni se altera ningún dato—, pero es
la red de seguridad si algo externo coincide en el tiempo.

---

## Paso 1 · Preflight (solo lectura)

Pega el contenido completo de `supabase/preflight.sql` en el SQL Editor.

Estado esperado **antes** de aplicar: las 21 primeras filas en `true` y estas dos en
`false`:

```
cierre: confirm_closure exige entrega cumplida   false
pagos: la captura solo la afirma el servidor     false
```

- Si alguna de esas dos ya está en `true`, la migración está aplicada: **no la ejecutes
  otra vez** (abortaría con `MIGRATION_ALREADY_APPLIED`, sin daño, pero no hay nada que
  hacer).
- Si `pagos: tabla payments` está en `false`, falta la migración 7: aplica primero
  `202610120001_milestones_payments.sql`.

---

## Paso 2 · Aplicar

En **Supabase → SQL Editor**, con la sesión de la propietaria del proyecto, pega el
contenido **completo** de:

```
supabase/migrations/202610130001_closure_requires_delivery.sql
```

El archivo abre su propia transacción y se protege solo:

| Error | Significado | Qué hacer |
|---|---|---|
| `PREREQUISITE_MISSING` | falta la migración 7 (`payments`) | `rollback;`, aplicar la 7 y volver |
| `MIGRATION_ALREADY_APPLIED` | ya estaba aplicada | `rollback;` y seguir al paso 3 |
| cualquier otro | se revierte todo el archivo | **`rollback;` antes de cualquier otra consulta**, y revisar |

> PostgreSQL deja la sesión en transacción abortada tras un error. Ejecuta `rollback;`
> antes de escribir nada más, o toda consulta siguiente fallará.

---

## Paso 3 · Verificar

**3.1 Preflight de nuevo.** Las 23 filas deben estar en `true`.

**3.2 Las reglas están vivas** (solo lectura):

```sql
select p.proname,
       pg_get_functiondef(p.oid) like '%DELIVERY_REQUIRED%'    as exige_entrega,
       pg_get_functiondef(p.oid) like '%CAPTURE_NOT_ALLOWED%'  as captura_solo_servidor,
       p.prosecdef                                             as security_definer,
       array_to_string(p.proconfig, ',')                       as search_path,
       array_to_string(p.proacl::text[], ' | ')                as permisos
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('confirm_closure', 'record_payment_result')
order by p.proname;
```

Esperado: `confirm_closure` con `exige_entrega = true`; `record_payment_result` con
`captura_solo_servidor = true`; ambas con `security_definer = true`,
`search_path = search_path=""`, y en `permisos` solo `postgres` y `authenticated`
(más `service_role` en `record_payment_result`). **Nunca `anon` ni `=X/` a secas**, que
sería `PUBLIC`.

**3.3 Hitos pendientes en Pactos abiertos** — a cuántos Pactos en vuelo afecta la nueva
regla (solo lectura, sin datos personales):

```sql
select count(distinct a.pacto_id) as pactos_activos_sin_entrega
from public.agreements a
join public.milestones m on m.agreement_id = a.id
join public.pactos pa on pa.id = a.pacto_id
where a.state = 'ACCEPTED'
  and pa.status = 'ACTIVE'
  and m.status not in ('APPROVED', 'PAID');
```

Son los Pactos que, a partir de ahora, necesitarán evidencia y autorización antes de
poder cerrarse. No quedan bloqueados: la otra salida sigue siendo cancelar con motivo.

**3.4 Recorrido en la interfaz.** Con el código desplegado, en Modo Juez: crear → invitar
→ unirse → enviar → aceptar ambas partes. En ese punto **no debe aparecer «Confirmar
cierre»**, sino «Esperando la entrega del proveedor». Tras evidencia y autorización, el
stepper marca «✓ Entrega autorizada» y entonces sí aparece el cierre.

---

## Paso 4 · Reversión, si hiciera falta

```
supabase/rollback/202610130001_closure_requires_delivery.down.sql
```

Restaura los cuerpos anteriores. No borra datos. Verificado: tras revertir, los permisos
quedan intactos y los Pactos se conservan; la migración se puede volver a aplicar
después.

> **Advertencia:** revertir reabre E-1 y E-2. Úsalo solo para salir de una incidencia.

**Orden inverso obligatorio.** Si alguna vez hay que revertir también la migración 7,
esta va primero. `202610120001_milestones_payments.down.sql` se niega con
`ROLLBACK_OUT_OF_ORDER` mientras la regla de entrega siga aplicada, porque retirar
`milestones.status` dejaría `confirm_closure` roto en ejecución.

---

## Paso 5 · Después de aplicar: los pagos necesitan una clave más

`SUPABASE_SERVICE_ROLE_KEY` pasa a ser **obligatoria para que los pagos funcionen**, en
Vercel y como variable *Sensitive*. Es consecuencia directa de E-2: si un cobro solo lo
afirma el servidor, necesita escribirlo sin sesión de usuario.

Sin esa clave no se rompe nada: `isSettlementConfigured()` devuelve `false`, PACTO no
ofrece el botón de pagar y muestra «el pago con PayPal todavía no está activado». Es
deliberado — preferible a cobrar en PayPal y no poder registrarlo.

PayPal permanece **exclusivamente en Sandbox**: `apiBase()` ignora `PAYPAL_API_BASE` y
devuelve siempre el host de Sandbox, así que el código no puede generar cobros reales.
