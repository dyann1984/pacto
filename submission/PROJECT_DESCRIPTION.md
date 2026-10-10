# PACTO — problema, solución, impacto y tecnologías

## El problema

La mayoría de los acuerdos entre pequeños negocios y proveedores viven en mensajes
de WhatsApp, correos sueltos y notas de voz. Cuando algo falla, nadie puede
demostrar qué se acordó, cuándo cambió ni quién aceptó qué.

De ahí salen tres problemas concretos:

1. **Alcance ambiguo.** "Rediseñar la tienda" significa cosas distintas para cada parte.
2. **Pagos sin respaldo.** Se paga por adelantado y por confianza, o no se paga y se
   pierde la relación comercial.
3. **Sin rastro.** Si hay desacuerdo, no existe un registro imparcial de los hechos.

Para una empresa pequeña, llevar esto a un abogado cuesta más que el propio acuerdo.

## La solución

PACTO convierte un acuerdo informal en un recorrido claro con cinco pasos
verificables, que ambas partes ven igual:

1. **Acuerdo creado.** El cliente define alcance, criterios de aceptación e importe.
2. **Proveedor unido.** Se le invita con un enlace seguro de un solo uso, sin que
   nadie tenga que buscar identificadores técnicos.
3. **En revisión.** La IA señala ambigüedades, obligaciones, fechas y riesgos del
   alcance antes de que nadie se comprometa.
4. **Aceptado por ambas partes.** Las dos aceptan explícitamente la misma versión.
   Cualquier cambio posterior genera una versión nueva que hay que volver a aceptar.
5. **Entrega y pago.** El proveedor presenta evidencia de cumplimiento, el cliente
   la revisa y **autoriza explícitamente**, y solo entonces se puede pagar con PayPal.

Cada acción queda registrada con actor, fecha y versión en un historial que ninguna
de las partes puede alterar.

## Qué lo hace distinto

**La IA aconseja; las personas deciden.** El análisis con IA nunca cambia el
acuerdo, nunca acepta en nombre de nadie y nunca autoriza un pago. Eso no es una
promesa redactada: la base de datos lo impide. Pagar exige que el hito esté en
estado `APPROVED`, y solo el cliente puede ponerlo ahí, y solo después de que
exista evidencia del proveedor.

**La seguridad no depende de la interfaz.** Las reglas viven en PostgreSQL con
Row Level Security y funciones `SECURITY DEFINER`. Un formulario manipulado no
consigue nada: el importe del pago se lee del hito en la base, no del formulario.

**Los jueces pueden probarlo sin registrarse.** "Explorar DEMO" crea una sesión
anónima real de Supabase, aislada por las mismas políticas que cualquier cuenta.

## Impacto

- **Para el cliente:** paga contra evidencia revisada, no contra promesas.
- **Para el proveedor:** una autorización explícita y fechada en lugar de un
  "te pago la semana que viene".
- **Para ambos:** un historial imparcial si hay desacuerdo.

El modelo encaja con las economías donde el comercio entre pequeños negocios se
hace por mensajería informal. La interfaz está en español y los importes en pesos
mexicanos.

## Tecnologías

| Capa | Tecnología | Papel |
|---|---|---|
| Interfaz | Next.js 16 (App Router, Server Actions) | Renderizado en servidor; sin API propia que proteger |
| Lenguaje | TypeScript estricto | |
| Datos | Supabase Postgres + RLS | Las reglas de negocio viven en la base |
| Identidad | Supabase Auth | Correo con confirmación, sesiones anónimas para la DEMO |
| Pagos | PayPal Orders v2 (Sandbox) | Órdenes, captura, estado y webhooks firmados |
| IA | API de Anthropic (`claude-sonnet-5-5`) | Análisis del alcance del acuerdo |
| Despliegue | Vercel | Production y Preview por rama |
| Pruebas | Vitest + PGlite + Playwright | RLS contra un Postgres real; recorrido completo en navegador |

`PGlite` permite ejecutar las migraciones reales contra un PostgreSQL en memoria,
así que las políticas de seguridad se prueban de verdad, no con dobles.
