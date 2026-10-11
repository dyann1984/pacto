"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { isJudgeMode } from "@/lib/judge-session";
import { explainViewer, type Viewer } from "@/domain/access";

// Explica por qué un recurso no está disponible, SIN revelar nada sobre él: la decisión
// vive en @/domain/access y solo mira la sesión de quien está delante.
export function AccessExplainer() {
  const [viewer, setViewer] = useState<Viewer>("loading");

  useEffect(() => {
    let cancelled = false;
    async function look() {
      if (isJudgeMode()) {
        if (!cancelled) setViewer("judge");
        return;
      }
      try {
        const {
          data: { user },
        } = await supabaseBrowser().auth.getUser();
        if (!cancelled) setViewer(explainViewer(false, user));
      } catch {
        // Sin poder comprobar la sesión se asume la explicación más neutral.
        if (!cancelled) setViewer("anonymous");
      }
    }
    look();
    return () => {
      cancelled = true;
    };
  }, []);

  if (viewer === "loading") return null;

  if (viewer === "judge")
    return (
      <div className="notice notice-info" role="status">
        <strong>Estás en Modo Juez, con dos identidades DEMO.</strong>
        <p>
          Cada identidad solo ve sus propios Pactos, igual que dos personas distintas. Si
          este acuerdo lo creó la otra parte, cambia de identidad en la barra del Modo Juez
          y vuelve a abrirlo. Si reiniciaste la demostración, los Pactos anteriores
          pertenecen a identidades que ya no usas: empieza un recorrido nuevo.
        </p>
      </div>
    );

  if (viewer === "demo")
    return (
      <div className="notice notice-info" role="status">
        <strong>Estás en una sesión DEMO temporal y privada.</strong>
        <p>
          Las sesiones DEMO están aisladas entre sí: un Pacto creado en otra sesión, en otro
          navegador o antes de borrar los datos del sitio no es accesible desde esta. No es
          un fallo, es el mismo aislamiento que protege a cualquier usuario.{" "}
          <Link href="/sign-up">Crea una cuenta</Link> para conservar tus Pactos entre
          sesiones.
        </p>
      </div>
    );

  if (viewer === "anonymous")
    return (
      <div className="notice notice-info" role="status">
        <strong>No hay ninguna sesión abierta en este navegador.</strong>
        <p>
          <Link href="/sign-in">Inicia sesión</Link> y vuelve a abrir el enlace, o{" "}
          <Link href="/demo">explora en modo DEMO</Link>.
        </p>
      </div>
    );

  return (
    <div className="notice notice-info" role="status">
      <strong>Tu sesión está abierta, pero este recurso no es tuyo.</strong>
      <p>
        O no existe, o no eres participante de ese Pacto. Solo el comprador y el proveedor
        pueden abrirlo; ni siquiera se revela si existe. Si esperabas tener acceso, pide a
        la otra parte que te envíe de nuevo el enlace de invitación.
      </p>
    </div>
  );
}
