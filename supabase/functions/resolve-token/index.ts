import { z } from "zod";
import { createServiceClient } from "../_shared/supabase.ts";
import { verifyJWT } from "../_shared/auth.ts";

const Body = z.object({ token: z.string().min(20) });

const CORS = {
  "Access-Control-Allow-Origin": "https://help.institutometrik.com.br",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return new Response(JSON.stringify({ error: "invalid_body" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await verifyJWT(body.token);
  } catch {
    return new Response(JSON.stringify({ error: "invalid_token" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const sessionId = payload.session_id as string;
  const client = createServiceClient();
  const { data: sess } = await client
    .from("sessions")
    .select("id, lang, plugin_context")
    .eq("id", sessionId)
    .single();
  if (!sess) {
    return new Response(JSON.stringify({ error: "session_not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const ctx = sess.plugin_context ?? {};
  const greeting = ctx.last_error
    ? `Detectei que você está no ${ctx.sketchup_version} (${ctx.os}) e teve o erro: ${ctx.last_error}. Vamos resolver?`
    : `Detectei que você está usando ${ctx.sketchup_version} (${ctx.os}). Como posso ajudar?`;

  return new Response(
    JSON.stringify({ session_id: sess.id, lang: sess.lang, greeting }),
    { status: 200, headers: { "Content-Type": "application/json", ...CORS } },
  );
});
