import { supabase } from "@/lib/supabaseClient";
import { VAPID_PUBLIC_KEY } from "@/lib/env";

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && !!VAPID_PUBLIC_KEY;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Asks the browser for notification permission (if not already
 * decided) and, if granted, subscribes this device to push and saves
 * the subscription server-side. Never tries to work around a denial
 * (spec §26) — the caller just gets `false` back and can show an
 * informational message.
 */
export async function enablePushForEmployee(employeeId: string): Promise<boolean> {
  return enablePush({ owner_type: "employee", employee_id: employeeId, admin_user_id: null });
}

export async function enablePushForAdmin(adminUserId: string): Promise<boolean> {
  return enablePush({ owner_type: "admin", employee_id: null, admin_user_id: adminUserId });
}

async function enablePush(owner: {
  owner_type: "admin" | "employee";
  employee_id: string | null;
  admin_user_id: string | null;
}): Promise<boolean> {
  if (!isPushSupported()) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = subscription.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      ...owner,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth_key: json.keys?.auth,
    },
    { onConflict: "endpoint" },
  );
  return !error;
}

export function currentPermission(): NotificationPermission | "unsupported" {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}
