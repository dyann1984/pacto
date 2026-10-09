# Guía para jueces — PACTO

## Acceso

**URL (Preview):** `https://pacto-git-contest-cierre-ia-mvp-dyann1984s-projects.vercel.app`

El Preview está protegido por Vercel Authentication. La propietaria del proyecto
les hará llegar el enlace de acceso (o las credenciales temporales de PACTO) por
un canal privado — no están publicadas en este repositorio ni en la interfaz.

**Cuentas DEMO:** dos cuentas de prueba, creadas administrativamente y
confirmadas automáticamente (sin datos reales, sin pagos). Las credenciales las
entrega la propietaria por separado.

## Recorrido sugerido (3 minutos)

1. **Iniciar sesión** con la cuenta DEMO A (compradora). Observen el botón de
   mostrar/ocultar contraseña y los mensajes de error diferenciados si prueban
   una contraseña incorrecta.
2. **`/pactos`**: ya existe un Pacto **cerrado** (ciclo completo: creado,
   revisado, aceptado por ambas partes, cerrado con doble confirmación) y uno
   **cancelado** (con motivo auditado). Ábranlos para ver el historial de
   actividad.
3. **Crear un Pacto nuevo**: alcance, importe, añadir a la cuenta DEMO B como
   proveedor, enviar a revisión.
4. **Análisis de IA** (si está configurada una clave de Anthropic): pulsen
   "Analizar" en un acuerdo para ver hallazgos reales, no simulados. Si no hay
   clave configurada, el panel lo indica explícitamente en vez de simular un
   resultado.
5. **Aislamiento**: intenten abrir el Pacto cancelado desde una sesión de la
   cuenta DEMO B que no participa en él — deben recibir 404, no una versión
   oculta de los datos.
6. **Rol administrador**: `/admin` no es accesible para las cuentas DEMO (404).
   Solo la cuenta administradora de la propietaria del proyecto puede verlo;
   no forma parte de la demostración pública.

## Qué NO está habilitado todavía (ver `docs/pending-public-launch.md`)

- Entrega de correo real (confirmación de cuenta, recuperación de contraseña)
  para registros nuevos: el proyecto usa el límite gratuito de Supabase.
- "Continuar con Google": el botón existe pero está deshabilitado hasta
  configurar el proveedor.

Estas dos cosas son intencionalmente pendientes para esta fase de concurso; no
son errores. El registro con correo y contraseña, y el inicio de sesión de las
cuentas DEMO, sí son completamente reales y funcionales.
