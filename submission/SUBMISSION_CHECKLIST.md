# Lista de verificación para la entrega

## AVISO IMPORTANTE: las reglas oficiales NO están verificadas

Intenté consultar las reglas oficiales en `paypalaihackathon.devpost.com/rules`
y **Devpost rechaza el acceso automático (HTTP 403)**. La información de abajo
procede de fuentes secundarias y **no debe darse por buena**.

**Antes de entregar, abre tú las pestañas *Rules* y *Submission Requirements* de
la página oficial de Devpost y contrasta cada línea.** Ninguna casilla de este
archivo puede marcarse como cumplida hasta que lo hagas.

Lo único que aparece en un canal oficial de PayPal (su blog de desarrolladores) es
el requisito de fondo: **el proyecto debe usar de forma significativa PayPal y la
inteligencia artificial**.

| Dato | Fuente | Estado |
|---|---|---|
| Debe integrar PayPal e IA | Blog de desarrolladores de PayPal | Oficial |
| Fecha límite: 13 de noviembre de 2026 | Agregador externo | **Sin verificar** |
| Abierto a mayores de edad, con exclusiones habituales | Agregador externo | **Sin verificar** |
| Individual o por equipos; se admiten proyectos existentes con mejoras | Agregador externo | **Sin verificar** |
| Premios superiores a 67 500 USD | Agregador externo | **Sin verificar** |
| Duración del vídeo, campos obligatorios, licencia, visibilidad del repositorio | — | **No encontrado** |

---

## Requisito de fondo: PayPal + IA

| Elemento | Estado | Evidencia |
|---|---|---|
| Integración con el API de PayPal (Sandbox) | **Implementada**, sin demostración real | `src/lib/paypal.ts`, `PAYPAL_INTEGRATION.md`; faltan credenciales |
| Órdenes, captura, estado y webhooks firmados | Implementado y probado con dobles | 14/14 pruebas |
| Integración con un modelo de IA | **Implementada**, sin demostración real | `src/lib/ai.ts`, `AI_INTEGRATION.md`; falta la clave |
| La IA aporta valor real al producto | Sí: revisa el acuerdo antes de comprometerse | `AI_INTEGRATION.md` |
| Uso significativo, no decorativo | Sí: la IA revisa y PayPal paga, dentro del mismo recorrido | `DEMO_GUIDE.md` |

**Riesgo principal de la entrega:** ni el pago ni el análisis están activos, porque
faltan credenciales. Si el jurado prueba la DEMO hoy, verá el recorrido completo de
acuerdos y entregas, pero en los puntos de PayPal e IA encontrará un aviso de que
no están activados. Ambas cosas se resuelven **solo añadiendo variables de
entorno**, sin tocar el código.

## Entregables preparados

| Entregable | Estado |
|---|---|
| Aplicación pública funcionando | https://pacto-pearl.vercel.app |
| Repositorio con el código | `dyann1984/pacto` (**privado**; ver abajo) |
| Guion del vídeo en inglés, menos de 3 minutos | `VIDEO_SCRIPT.md` |
| Vídeo grabado y subido | **Pendiente** |
| Descripción del proyecto | `PROJECT_DESCRIPTION.md` |
| Arquitectura | `ARCHITECTURE.md` |
| Documentación de PayPal | `PAYPAL_INTEGRATION.md` |
| Documentación de IA | `AI_INTEGRATION.md` |
| Guía para jueces | `DEMO_GUIDE.md` |
| Instalación y ejecución | `README.md` |
| Capturas | **Pendiente**; lista sugerida abajo |

## Decisiones que requieren a la propietaria

1. **Visibilidad del repositorio.** Hoy es privado. Muchos concursos exigen código
   accesible al jurado. **No la he cambiado y no la cambiaré sin tu autorización.**
   Comprueba en las reglas oficiales si se exige repositorio público.
2. **Licencia.** No hay archivo de licencia. Si las reglas piden código abierto,
   habría que añadir una (MIT es lo habitual).
3. **Credenciales de PayPal Sandbox**, para que el pago sea demostrable.
4. **Clave de Anthropic**, para que el análisis sea demostrable. Genera gasto;
   con `claude-haiku-5-5` el coste es de unos 2 dólares por mil análisis.

## Capturas recomendadas para Devpost

1. **Página inicial** — la propuesta y el botón «Explorar DEMO».
2. **Panel «Qué sigue»** con la barra de 5 pasos, en un acuerdo recién creado.
3. **Enlace de invitación generado**, con el aviso de un solo uso y caducidad.
4. **Vista previa de la invitación** en la ventana del proveedor, antes de unirse.
5. **Análisis de IA** con hallazgos citando el texto del acuerdo (requiere la clave).
6. **«Entregas y pagos»** con la evidencia del proveedor y el botón de autorizar.
7. **Pantalla de aprobación de PayPal Sandbox** (requiere credenciales).
8. **Hito pagado** con su comprobante de captura.
9. **Actividad del Pacto**, mostrando el historial completo.
10. **Panel administrativo**, para evidenciar el control de acceso por rol.

Las capturas 5, 7 y 8 **no deben recrearse ni simularse**. Si esas funciones no
están activas al preparar la entrega, se omiten y se explica en el texto.
