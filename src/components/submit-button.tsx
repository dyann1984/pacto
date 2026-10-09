"use client";
import { useFormStatus } from "react-dom";

// Botón de formulario que se desactiva mientras la acción se procesa: evita dobles
// envíos (p. ej. dos clics en "Aceptar") y muestra que algo está ocurriendo.
export function SubmitButton({
  children,
  pendingText = "Procesando…",
  className = "button",
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} aria-busy={pending}>
      {pending ? pendingText : children}
    </button>
  );
}
