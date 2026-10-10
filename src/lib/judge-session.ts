"use client";
import { createClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Modo Juez: dos sesiones DEMO reales y aisladas en el mismo navegador, para que
 * una sola persona pueda recorrer PACTO actuando como cliente y como proveedor.
 *
 * No es una simulación ni un atajo de seguridad. Cada sesión es un usuario
 * anónimo real de Supabase con su propio auth.uid(), y el servidor sigue
 * aplicando exactamente las mismas políticas RLS y las mismas RPC. Cambiar de
 * rol equivale a iniciar sesión como la otra persona: nada se salta, nada se
 * falsifica. Lo único que guarda el navegador son los testigos de ambas
 * sesiones, que nunca salen de este equipo.
 */

import { useSyncExternalStore } from "react";

const KEY = "pacto.modo-juez";

// Pequeño store suscribible: los componentes leen el rol activo sin fijar estado
// dentro de un efecto, y se vuelven a renderizar al cambiar de parte.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((listener) => listener());
}

/** Rol activo en el Modo Juez, o null fuera de él (y siempre en el servidor). */
export function useJudgeRole() {
  return useSyncExternalStore(
    subscribe,
    () => judgeState()?.acting ?? null,
    () => null,
  );
}

type StoredSession = { accessToken: string; refreshToken: string; userId: string };
type JudgeState = {
  buyer: StoredSession;
  seller: StoredSession;
  acting: "BUYER" | "SELLER";
  pactoId?: string;
};

function read(): JudgeState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as JudgeState) : null;
  } catch {
    return null;
  }
}

function write(state: JudgeState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* Navegación privada sin almacenamiento: el modo se pierde al recargar. */
  }
  notify();
}

export function judgeState() {
  return read();
}

export function isJudgeMode() {
  return read() !== null;
}

export function exitJudgeMode() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* Nada que limpiar. */
  }
  notify();
}

export function rememberPacto(pactoId: string) {
  const state = read();
  if (state) write({ ...state, pactoId });
}

/**
 * Crea una sesión anónima con un cliente desechable que no guarda nada. Es
 * deliberado: cerrar sesión para crear la segunda identidad revocaba la primera
 * en el servidor (`session_not_found` al volver a usarla). Así ambas sesiones
 * nacen vivas y siguen siéndolo.
 */
async function newAnonymousSession(): Promise<StoredSession> {
  const throwaway = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const { data, error } = await throwaway.auth.signInAnonymously();
  // Supabase limita los accesos anónimos por hora y por IP. Se distingue de un
  // fallo genérico para poder decirle a la persona que solo tiene que esperar.
  if (error?.status === 429 || error?.code === "over_request_rate_limit")
    throw new Error("DEMO_RATE_LIMITED");
  if (error || !data.session) throw new Error("DEMO_UNAVAILABLE");
  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    userId: data.session.user.id,
  };
}

async function activate(session: StoredSession) {
  const db = supabaseBrowser();
  const { error } = await db.auth.setSession({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });
  if (error) throw new Error("DEMO_UNAVAILABLE");
}

/**
 * Crea dos sesiones DEMO nuevas y deja activa la del cliente. Cada llamada
 * genera un escenario completamente nuevo: no borra ni toca nada anterior.
 */
export async function startJudgeMode() {
  const seller = await newAnonymousSession();
  const buyer = await newAnonymousSession();
  // Si Supabase devolviera la misma identidad, el recorrido no sería válido:
  // se aborta en vez de aparentar que hay dos partes distintas.
  if (seller.userId === buyer.userId) throw new Error("DEMO_UNAVAILABLE");
  await activate(buyer);
  write({ buyer, seller, acting: "BUYER" });
}

/** Cambia la identidad activa. El servidor ve a la otra persona, sin más. */
export async function switchRole() {
  const state = read();
  if (!state) throw new Error("DEMO_UNAVAILABLE");
  const next = state.acting === "BUYER" ? "SELLER" : "BUYER";
  await activate(next === "BUYER" ? state.buyer : state.seller);
  write({ ...state, acting: next });
  return next;
}
