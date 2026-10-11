# Runbook · desplegar `d0da619` a producción

Publica la corrección de E-1 y E-2 en la interfaz. **La defensa de seguridad ya está
activa**: vive en la base de datos y se aplicó el 10 de octubre de 2026. Este despliegue
no cierra ninguna vulnerabilidad nueva; corrige la experiencia.

- Proyecto Vercel: `pacto` (`dyann1984's projects`)
- Rama de producción: **`production`** (no `contest/cierre-ia-mvp`)
- Producción actual: `7d089408f405bd2cd3f7670bf1c258db8ab1a9d6` — *«merge: record the
  completed deployment and the real production screenshots»*
- A publicar: `d0da619f9c366be643a9647856e063f4274bb2e9`, un único commit sobre
  `feat/paypal-ai-demo`
- Fusión comprobada en seco: **sin conflictos**, 25 archivos

## Por qué conviene desplegarlo

Producción ejecuta el código anterior, que no conoce el código de error
`DELIVERY_REQUIRED` que ahora devuelve la base. Si alguien intenta cerrar un Pacto antes
de la entrega, el servidor lo rechaza correctamente —eso ya funciona— pero la interfaz
muestra el mensaje genérico «No se pudo completar la acción». Seguro, pero confuso.

Con `d0da619` la interfaz explica el motivo, el recorrido gana la etapa «Entrega
autorizada», y el 404 distingue las tres causas de «Pacto no disponible».

## Antes de desplegar

```bash
corepack pnpm@11.28.5 install --frozen-lockfile
corepack pnpm@11.28.5 lint
corepack pnpm@11.28.5 typecheck
corepack pnpm@11.28.5 test
corepack pnpm@11.28.5 build
corepack pnpm@11.28.5 check:secrets
```

Y confirmar que el preflight de Supabase sigue en **23/23** (ver
`docs/runbook-migracion-202610130001.md`, paso 3).

## Desplegar

```bash
git checkout production
git pull --ff-only origin production
git merge --no-ff feat/paypal-ai-demo -m "merge: publicar la correccion de cierre y pagos (d0da619)"
git push origin production
```

Vercel construye y publica automáticamente. Seguir el despliegue en
`vercel.com/dyann1984s-projects/pacto/deployments`.

> **Alternativa descartada.** Promover el despliegue Preview existente desde el panel
> sería más rápido, pero ese build se compiló con las variables `NEXT_PUBLIC_*` del
> entorno *Preview*, no las de Producción. Apuntan a la misma base —está verificado—,
> pero publicar un artefacto construido con variables de otro entorno es una diferencia
> silenciosa que no compensa. Mejor que Vercel reconstruya con las de Producción.

## Verificar después

1. `https://pacto-pearl.vercel.app` responde y el despliegue figura como **Ready**.
2. El recorrido muestra **seis** etapas, con «Entrega autorizada» en quinta posición.
3. Con el acuerdo aceptado y el hito sin entregar, **no** aparece «Confirmar cierre»;
   en su lugar, «Esperando la entrega del proveedor».
4. Tras evidencia y autorización, aparece «Confirma el cierre».
5. Un identificador de Pacto ajeno devuelve 404 con la explicación según la sesión.
6. El pago sigue mostrando «no activado» mientras falte `SUPABASE_SERVICE_ROLE_KEY`.

## Reversión

Tres capas independientes. **Revertir el código NO exige revertir la base**: las reglas
nuevas de la base son compatibles con el código anterior (solo degradan el mensaje de
error), así que la capa 1 es segura por sí sola.

### Capa 1 · Instantánea, desde el panel (recomendada)

Vercel → Deployments → el despliegue de producción anterior (`7d08940`) → **Instant
Rollback** / *Promote to Production*. Sin rebuild, segundos, reversible.

### Capa 2 · Git

```bash
git checkout production
git revert -m 1 <sha-del-merge>
git push origin production
```

### Capa 3 · Base de datos — solo si la migración fuera el problema

```
supabase/rollback/202610130001_closure_requires_delivery.down.sql
```

> **Advertencia:** revertir la base **reabre E-1 y E-2**. Hacerlo solo ante una incidencia
> demostrada causada por la migración, nunca por un fallo de la interfaz.

Comprobación de restauración: tras revertir, las huellas deben volver exactamente a

| función | md5 esperado al revertir |
|---|---|
| `confirm_closure` | `2d448bc8e561a10eb4fe797146497f5e` |
| `record_payment_result` | `92062165b8bc09b5ef08fc8571265324` |

(Valores actuales, ya migrados: `2309f57947d2574ecfa7b5d907f4d276` y
`efe79800b6db28de2617cdad58700695`.)

Si alguna vez hubiera que revertir también la migración 7, va **después** de esta: su
archivo de reversión se niega con `ROLLBACK_OUT_OF_ORDER` mientras la regla de entrega
siga aplicada.

## Lo que este despliegue NO hace

- **No activa los pagos.** Falta `SUPABASE_SERVICE_ROLE_KEY` en Vercel; sin ella
  `isSettlementConfigured()` es falso y no se ofrece pagar. Es el estado seguro.
- **No toca PayPal.** Sigue fijado a Sandbox por código: `apiBase()` ignora
  `PAYPAL_API_BASE` y devuelve siempre el host de Sandbox.
- **No activa el análisis con IA.** Falta `ANTHROPIC_API_KEY`.
- **No modifica ningún Pacto existente**, incluidos los 7 cerrados sin entrega.
