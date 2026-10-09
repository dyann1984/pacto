"use client";
import { useActionState, useState } from "react";
import { createInvitation, type InvitationState } from "@/app/pactos/actions";

// Invitación del proveedor: un enlace seguro de un solo uso. El correo se abre en el
// cliente de la propia persona (mailto:), así PACTO no envía mensajes en su nombre.
export function InviteSeller({ pactoId, title }: { pactoId: string; title: string }) {
  const [state, action, pending] = useActionState<InvitationState, FormData>(
    createInvitation,
    { status: "idle" },
  );
  const [copied, setCopied] = useState(false);

  if (state.status === "ok") {
    const subject = `Invitación a revisar el acuerdo «${title}» en PACTO`;
    const body = `Hola:\n\nTe invito a revisar y aceptar nuestro acuerdo «${title}» en PACTO.\n\nAbre este enlace para unirte como proveedor (es de un solo uso y caduca en 7 días):\n${state.link}\n\nGracias.`;
    const mailto = `mailto:${state.email ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return (
      <div className="invite-result">
        <label>
          Enlace de invitación
          <input
            readOnly
            value={state.link}
            onFocus={(e) => e.currentTarget.select()}
            aria-describedby="invite-help"
          />
        </label>
        <div className="button-row">
          <button
            type="button"
            className="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.link);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Enlace copiado ✓" : "Copiar enlace"}
          </button>
          <a className="button button-light" href={mailto}>
            Enviar por correo
          </a>
        </div>
        <p className="fine-print" id="invite-help">
          Es de un solo uso y caduca en 7 días. Si generas otro, este deja de
          funcionar.
          {state.email ? ` Solo ${state.email} podrá aceptarlo.` : ""}
        </p>
        <p className="fine-print">
          ¿Quieres probar el recorrido tú mismo? Abre el enlace en una ventana
          privada y entra como visitante DEMO para actuar como proveedor.
        </p>
      </div>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="pactoId" value={pactoId} />
      <label>
        Correo del proveedor (opcional)
        <input
          name="email"
          type="email"
          autoComplete="off"
          placeholder="proveedor@empresa.com"
          maxLength={254}
        />
      </label>
      <p className="fine-print">
        Si escribes un correo, solo esa cuenta podrá aceptar la invitación. Sin
        correo, la aceptará quien abra el enlace primero.
      </p>
      {state.status === "error" && (
        <div className="notice" role="alert">
          {state.message}
        </div>
      )}
      <button className="button" disabled={pending}>
        {pending ? "Generando…" : "Generar enlace de invitación"}
      </button>
    </form>
  );
}
