// ============================================================
// Web Push (notificações no celular) — inscrição do aparelho
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getPushPermission(): NotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  return Notification.permission;
}

// Lê a chave pública VAPID do banco (app_settings)
export async function fetchVapidPublicKey(
  supabase: SupabaseClient
): Promise<string> {
  const { data } = await supabase
    .from("app_settings")
    .select("vapid_public_key")
    .eq("id", 1)
    .single();
  return data?.vapid_public_key || "";
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

// Ativa as notificações neste aparelho e salva a inscrição no banco
export async function subscribeToPush(
  supabase: SupabaseClient,
  userId: string,
  vapidPublicKey: string
): Promise<void> {
  if (!isPushSupported()) {
    throw new Error("Notificações não são suportadas neste navegador.");
  }
  if (!vapidPublicKey) {
    throw new Error("Chave pública de notificações não configurada.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permissão de notificações negada.");
  }

  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    throw new Error(
      "Service worker não registrado. Instale o app (PWA) e tente novamente."
    );
  }

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });
  }

  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) throw new Error("Falha ao obter as chaves da inscrição.");

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh,
      auth,
      user_agent: navigator.userAgent,
    },
    { onConflict: "endpoint" }
  );
  if (error) throw error;
}

// Desativa as notificações neste aparelho
export async function unsubscribeFromPush(
  supabase: SupabaseClient
): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }
}
