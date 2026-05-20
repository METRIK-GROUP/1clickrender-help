import { createServiceClient } from "../_shared/supabase.ts";
import { verifyJWT } from "../_shared/auth.ts";

const CORS = {
  "Access-Control-Allow-Origin": "https://help.institutometrik.com.br",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Credentials": "true",
};

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === name) return v;
  }
  return null;
}

async function ensureAdmin(req: Request): Promise<boolean> {
  const cookie = parseCookie(req.headers.get("cookie"), "admin_token");
  if (!cookie) return false;
  try {
    const p = await verifyJWT(cookie);
    return p.admin === true;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (!(await ensureAdmin(req))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const url = new URL(req.url);
  const endpoint = url.searchParams.get("endpoint") ?? "overview";
  const client = createServiceClient();

  if (endpoint === "overview") {
    const since7d = new Date(Date.now() - 7 * 86400_000).toISOString();
    const [reports, gaps, msgs, fb] = await Promise.all([
      client.from("daily_reports").select("*").order("report_date", { ascending: false }).limit(7),
      client.from("kb_gaps").select("*").eq("status", "open").order("frequency", { ascending: false }).limit(10),
      client.from("messages").select("session_id, latency_ms, role").gte("created_at", since7d),
      client.from("feedback").select("rating").gte("created_at", since7d),
    ]);
    const conversations = new Set(msgs.data?.filter((m) => m.role === "assistant").map((m) => m.session_id)).size;
    const pos = (fb.data ?? []).filter((f) => f.rating === 1).length;
    const neg = (fb.data ?? []).filter((f) => f.rating === -1).length;
    const latencies = (msgs.data ?? []).filter((m) => m.role === "assistant" && m.latency_ms).map((m) => m.latency_ms!);
    const avgLatency = latencies.length ? Math.round(latencies.reduce((s, n) => s + n, 0) / latencies.length) : 0;
    return new Response(JSON.stringify({
      reports: reports.data,
      gaps: gaps.data,
      metrics: { conversations_7d: conversations, satisfaction: pos + neg ? Math.round((pos / (pos + neg)) * 100) : null, avg_latency_ms: avgLatency },
    }), { headers: { "Content-Type": "application/json", ...CORS } });
  }

  if (endpoint === "reports") {
    const { data } = await client.from("daily_reports").select("*").order("report_date", { ascending: false }).limit(30);
    return new Response(JSON.stringify({ reports: data }), { headers: { "Content-Type": "application/json", ...CORS } });
  }

  if (endpoint === "gaps") {
    const { data } = await client.from("kb_gaps").select("*").order("frequency", { ascending: false }).limit(100);
    return new Response(JSON.stringify({ gaps: data }), { headers: { "Content-Type": "application/json", ...CORS } });
  }

  if (endpoint === "conversations") {
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const { data: sessions } = await client.from("sessions").select("*").order("created_at", { ascending: false }).limit(limit);
    const ids = (sessions ?? []).map((s) => s.id);
    const { data: msgs } = await client.from("messages").select("*").in("session_id", ids).order("created_at", { ascending: true });
    return new Response(JSON.stringify({ sessions, messages: msgs }), { headers: { "Content-Type": "application/json", ...CORS } });
  }

  return new Response(JSON.stringify({ error: "unknown_endpoint" }), {
    status: 400,
    headers: { "Content-Type": "application/json", ...CORS },
  });
});
