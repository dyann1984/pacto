# Pendiente para apertura pública (fuera del alcance del concurso)

Documentado por separado a propósito: ninguno de los dos puntos bloquea la
demostración para el concurso, que usa cuentas DEMO pre-confirmadas
administrativamente.

## 1. Entrega real de correo (SMTP)

El proyecto usa el servicio de correo integrado de Supabase, limitado a **2
correos por hora**. Eso es suficiente para una demo con cuentas administrativas
preconfirmadas, pero **no** para que el público en general se registre y
reciba su correo de confirmación o de recuperación de contraseña de forma
confiable.

**Para abrir el registro al público** hace falta configurar un proveedor SMTP
propio en `Authentication → Emails → SMTP Settings`. Decisión pendiente, sin
costo hasta que se confirme:

- **Resend** (gratis hasta 3,000 correos/mes, 100/día): requiere una cuenta
  Resend y, para enviar a cualquier destinatario, un dominio propio verificado
  por DNS (3 registros: SPF, DKIM y opcionalmente DMARC) en el proveedor de DNS
  de ese dominio. Sin dominio propio, Resend permite enviar únicamente a la
  dirección de correo con la que se creó la cuenta Resend (`onboarding@resend.dev`),
  útil para pruebas personales pero no para usuarios reales.
- Cualquier otro proveedor SMTP transaccional (Postmark, SendGrid, Amazon SES)
  funciona igual de forma oficial en ese mismo panel.

Campos que pedirá Supabase una vez decidido el proveedor: remitente (correo y
nombre), host, puerto, usuario y contraseña del SMTP. Ninguno de esos valores
debe pegarse en el repositorio ni en el chat: se configuran directamente en el
panel de Supabase.

## 2. Google OAuth

El botón "Continuar con Google" ya existe en el código y refleja honestamente
que el proveedor está deshabilitado (ver `docs/google-oauth-setup.md` para los
pasos exactos en Google Cloud y Supabase). No requiere gasto: tanto la consola
de Google Cloud como el plan gratuito de Supabase lo permiten sin costo para
este volumen de uso.

## No se requiere ninguna acción para el concurso

Ambos puntos quedan documentados para una fase posterior. La demostración para
jueces no depende de ninguno de los dos.
