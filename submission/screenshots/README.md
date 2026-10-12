# Capturas para Devpost

Generadas el 12 de octubre de 2026 contra producción (https://pacto-pearl.vercel.app) con
`tests/e2e/devpost-shots.spec.ts`: un recorrido real del Modo Juez con un análisis real de
Anthropic. No se creó ningún pago para hacerlas: la captura de PayPal muestra el botón activo,
sin pulsarlo. Escritorio a 1440×900 (2×); móvil a 390×844 (3×).

| Archivo | Qué muestra | Uso sugerido |
|---|---|---|
| `01-portada.png` | Propuesta de valor con IA y PayPal, y las tres entradas | Portada de la galería |
| `02-como-funciona.png` | Los seis pasos: alcance, IA, aceptación, evidencia, PayPal, trazabilidad | Galería |
| `03-modo-juez.png` | Modo Juez: dos identidades reales, cambio de papel, mismas reglas | Galería / instrucciones |
| `04-crear-pacto.png` | Formulario precargado del Modo Juez | Video |
| `05-ia-analizando.png` | Estado de carga del análisis («Analizando el acuerdo…») | Video |
| `06-ia-hallazgos.png` | Análisis completo de `claude-sonnet-5-5`, con citas textuales y sugerencias | **Galería (IA)** |
| `07-invitacion.png` | Enlace de invitación de un solo uso | Galería |
| `08-invitacion-proveedor.png` | Lo que ve el proveedor antes de unirse | Video |
| `09-evidencia-por-revisar.png` | Evidencia del proveedor y el botón de autorizar, visto por el cliente | Galería |
| `10-pagar-con-paypal.png` | Hito autorizado con el botón de PayPal Sandbox activo | **Galería (PayPal)** |
| `11-recorrido-y-siguiente-paso.png` | Seis etapas, barra del Modo Juez y «Paga con PayPal y después confirma el cierre» | Galería |
| `12-pacto-completo.png` | Página completa del Pacto (larga) | Referencia |
| `13-movil-portada.png` … `16-movil-paypal.png` | Portada, Pacto, análisis con IA y pago en móvil | Galería (móvil) |

## Lo que no está en imagen fija

El estado **«Pagado» con su comprobante de PayPal** y el **Pacto cerrado** se verificaron en
producción (captura `7BB05851NH2454155`, 25 000 MXN, Pacto `c527f24e…`), pero ese Pacto
pertenece a una sesión anónima del Modo Juez y no se puede reabrir para fotografiarlo, y
generar otro exigiría un pago nuevo. Se graba en el video, en el momento del pago, o se
captura a mano desde el navegador durante la grabación.

## Regenerarlas

```bash
PACTO_E2E_SHOTS=1 PACTO_E2E_BASE_URL=https://pacto-pearl.vercel.app pnpm exec playwright test tests/e2e/devpost-shots.spec.ts
```

Gasta dos sesiones anónimas y un análisis con IA (dentro del cupo). No crea pagos.
