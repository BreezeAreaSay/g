// Stage 4: delivers ONE notifications row as real browser push messages.
// Triggered by the `trg_notifications_send_push` Database Webhook
// (0018_notification_webhook.sql) on every INSERT into `notifications`.
//
// Required secrets (see README "Push-уведомления"):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// Auto-provided by the Supabase platform, no setup needed:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";
import { buildPushMessage, type Lang } from "./messages.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

interface NotificationRow {
  id: string;
  recipient_type: "admin" | "employee";
  employee_id: string | null;
  type: string;
  data: Record<string, unknown>;
}

interface WebhookPayload {
  type: "INSERT";
  table: string;
  record: NotificationRow;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  owner_type: "admin" | "employee";
  employee_id: string | null;
  admin_user_id: string | null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const payload = (await req.json()) as WebhookPayload;
  const notification = payload.record;
  if (!notification) {
    return new Response("no record in payload", { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let subscriptions: SubscriptionRow[] = [];
  if (notification.recipient_type === "admin") {
    const { data } = await supabase.from("push_subscriptions").select("*").eq("owner_type", "admin");
    subscriptions = data ?? [];
  } else if (notification.employee_id) {
    const { data } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("owner_type", "employee")
      .eq("employee_id", notification.employee_id);
    subscriptions = data ?? [];
  }

  if (subscriptions.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "no subscriptions" }), { status: 200 });
  }

  // Look up each recipient's preferred language once, not per-subscription.
  const languageByAdmin = new Map<string, Lang>();
  const languageByEmployee = new Map<string, Lang>();

  const adminIds = [...new Set(subscriptions.filter((s) => s.admin_user_id).map((s) => s.admin_user_id!))];
  const employeeIds = [...new Set(subscriptions.filter((s) => s.employee_id).map((s) => s.employee_id!))];

  if (adminIds.length > 0) {
    const { data } = await supabase.from("admin_profiles").select("user_id, preferred_language").in("user_id", adminIds);
    for (const row of data ?? []) languageByAdmin.set(row.user_id, row.preferred_language as Lang);
  }
  if (employeeIds.length > 0) {
    const { data } = await supabase.from("employees").select("id, preferred_language").in("id", employeeIds);
    for (const row of data ?? []) languageByEmployee.set(row.id, row.preferred_language as Lang);
  }

  let sent = 0;
  const staleSubscriptionIds: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      const lang: Lang =
        (sub.owner_type === "admin" ? languageByAdmin.get(sub.admin_user_id!) : languageByEmployee.get(sub.employee_id!)) ?? "ru";
      const message = buildPushMessage(notification, lang);

      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          JSON.stringify({ title: message.title, body: message.body, type: notification.type, data: notification.data }),
        );
        sent++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          staleSubscriptionIds.push(sub.id);
        } else {
          console.error("push send failed", sub.id, err);
        }
      }
    }),
  );

  if (staleSubscriptionIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", staleSubscriptionIds);
  }

  return new Response(JSON.stringify({ sent, removed: staleSubscriptionIds.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
