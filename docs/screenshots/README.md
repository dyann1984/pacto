# Capturas de pantalla

Capturas **reales** del producto, sin retoques ni montajes. Las siete `juez-*`
se generaron automáticamente contra el despliegue de producción
(`https://pacto-pearl.vercel.app`) el 10 de octubre de 2026, recorriendo el
Modo Juez igual que lo haría un evaluador.

Para regenerarlas:

```bash
PACTO_E2E_BASE_URL=https://pacto-pearl.vercel.app PACTO_E2E_SHOTS=1 \
  pnpm exec playwright test tests/e2e/shots.spec.ts
cp test-results/juez-*.png docs/screenshots/
```

| Archivo | Qué muestra |
|---|---|
| `juez-1-portada.png` | Página inicial: la propuesta y las tres vías de entrada |
| `juez-2-modo-juez.png` | Modo Juez antes de empezar: qué se va a crear y por qué no es una simulación |
| `juez-3-barra-y-pasos.png` | Barra de rol, los seis pasos y el panel «Qué sigue» |
| `juez-4-invitacion.png` | Enlace de invitación generado, con su aviso de un solo uso y caducidad |
| `juez-5-hitos-y-pagos.png` | Evidencia del proveedor y el botón de autorizar, visto por el cliente |
| `juez-6-autorizado-paypal.png` | Hito ya autorizado, con el estado real de PayPal |
| `juez-7-movil.png` | El mismo recorrido en pantalla de teléfono |
| `landing-*.png`, `sign-in-*.png` | Portada y acceso, en escritorio y móvil |

## Lo que falta, y por qué no se inventa

Faltan las capturas del **análisis con IA** con hallazgos reales, de la
**pantalla de aprobación de PayPal Sandbox** y de un **hito pagado con su
comprobante**. Las tres requieren credenciales que todavía no están
configuradas (`docs/credentials-setup.md`).

No se recrean ni se simulan. En `juez-6` se ve exactamente lo que vería hoy un
juez: el aviso honesto de que el pago no está activado. En cuanto las
credenciales estén puestas, basta con volver a ejecutar el comando de arriba.
