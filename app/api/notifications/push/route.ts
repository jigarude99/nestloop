import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QueuedPush = {
  delivery_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  title: string;
  body: string;
  url: string;
  icon: string;
  badge: string;
  tag: string;
};

function getSupabaseServerClient(authorization?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase environment variables.");
  return createClient(url, key, {
    auth: { persistSession: false },
    global: authorization ? { headers: { Authorization: authorization } } : undefined
  });
}

async function isAuthorized(request: Request, cronSecret: string) {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization === `Bearer ${cronSecret}`) return true;
  if (!authorization.startsWith("Bearer ")) return false;

  const supabase = getSupabaseServerClient(authorization);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return !!user;
}

async function handlePush(request: Request) {
  const cronSecret = process.env.NOTIFICATION_CRON_SECRET;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:noreply@nestloop.app";

  if (!cronSecret || !publicKey || !privateKey) {
    return Response.json({ ok: false, error: "Push is not configured." }, { status: 500 });
  }

  if (!(await isAuthorized(request, cronSecret))) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc("collect_due_push_notifications", {
    p_secret: cronSecret,
    p_limit: 80
  });
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const queued = (data ?? []) as QueuedPush[];
  const sentIds = new Set<string>();
  const deadEndpoints = new Set<string>();
  const failed: Array<{ endpoint: string; statusCode?: number; message: string }> = [];

  await Promise.all(
    queued.map(async (item) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: item.endpoint,
            keys: {
              p256dh: item.p256dh,
              auth: item.auth
            }
          },
          JSON.stringify({
            title: item.title,
            body: item.body,
            url: item.url || "/",
            icon: item.icon || "/icon-192.png",
            badge: item.badge || "/icon-192.png",
            tag: item.tag || item.delivery_id
          })
        );
        sentIds.add(item.delivery_id);
      } catch (err) {
        const statusCode =
          typeof err === "object" && err && "statusCode" in err ? Number(err.statusCode) : undefined;
        if (statusCode === 404 || statusCode === 410) deadEndpoints.add(item.endpoint);
        failed.push({
          endpoint: item.endpoint,
          statusCode,
          message: err instanceof Error ? err.message : "Unknown push error"
        });
      }
    })
  );

  if (sentIds.size || deadEndpoints.size) {
    await supabase.rpc("mark_push_notifications_sent", {
      p_secret: cronSecret,
      p_delivery_ids: [...sentIds],
      p_dead_endpoints: [...deadEndpoints]
    });
  }

  return Response.json({
    ok: true,
    queued: queued.length,
    sent: sentIds.size,
    removedSubscriptions: deadEndpoints.size,
    failed: failed.length
  });
}

export async function GET(request: Request) {
  return handlePush(request);
}

export async function POST(request: Request) {
  return handlePush(request);
}
