# Guion de demostración (2 a 3 minutos)

Requisitos antes de presentar: migraciones 1 y 2 aplicadas en el proyecto DEMO, dos usuarios DEMO confirmados, `ANTHROPIC_API_KEY` configurada en el servidor. Si la clave falta, la pantalla lo indica en lugar de mostrar un resultado.

1. **Problema (20 s).** Los acuerdos comerciales entre comprador y proveedor viven en chats y correos: cambian sin rastro, nadie sabe cuál versión rige y las ambigüedades aparecen al cobrar.
2. **Crear y aceptar (45 s).** Iniciar sesión como comprador DEMO. Crear un Pacto con alcance e importe. Añadir al proveedor por su identidad DEMO. Enviar a revisión. Aceptar desde la sesión del proveedor. Mostrar que el acuerdo queda ACCEPTED y que cada paso aparece en la actividad.
3. **Análisis con IA (40 s).** Pulsar "Analizar versión 1". Mostrar el resumen, los hallazgos por categoría y severidad, la cita textual y la sugerencia. Señalar la huella de entrada y el modelo registrados. Aclarar que la IA no modifica el acuerdo.
4. **Cierre con doble confirmación (30 s).** Confirmar el cierre desde el comprador y después desde el proveedor. Mostrar el estado CLOSED y la nota de cierre en la actividad.
5. **Control de acceso (30 s).** Abrir el Pacto con un usuario que no participa y mostrar que no existe para él (404). Intentar modificar un Pacto cerrado: el sistema lo rechaza.
6. **Cierre del relato (15 s).** Todo queda en PostgreSQL con RLS y auditoría; la IA asiste, las personas deciden.

## Qué no mostrar

- No presentar resultados de IA si `NOT_CONFIGURED` aparece en pantalla.
- No mencionar pagos, PayPal ni ejecución de fondos: no existen en esta versión.
- No usar credenciales reales ni datos de personas reales.
