"use client";
import { useId, useState } from "react";

// Icono de ojo abierto/cerrado inline: sin dependencias nuevas, hereda currentColor.
function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z"
      />
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 3l18 18M10.6 5.2A10.9 10.9 0 0 1 12 5c7 0 10.5 7 10.5 7a17.8 17.8 0 0 1-3.2 4.1M6.6 6.6C3.4 8.6 1.5 12 1.5 12S5 19 12 19a10.6 10.6 0 0 0 4.2-.9M9.5 9.7a3.2 3.2 0 0 0 4.6 4.5"
      />
    </svg>
  );
}

export function PasswordField({
  name,
  label,
  autoComplete,
  required = true,
  minLength,
  maxLength,
  defaultValue,
}: {
  name: string;
  label: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  defaultValue?: string;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <label htmlFor={id}>
      {label}
      <span className="password-field">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          defaultValue={defaultValue}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
        >
          <EyeIcon open={visible} />
        </button>
      </span>
    </label>
  );
}
