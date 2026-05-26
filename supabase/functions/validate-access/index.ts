// Edge function: valida se um email tem licença ativa do 1 Click Render.
// Consulta a RPC public.check_1cr_chat_access no projeto Supabase do
// licenciamento (mofuvnzvblvrmamgpmcy), que por sua vez chama
// oneclick.check_chat_access (SECURITY DEFINER, retorna boolean).
//
// Não modifica nada no schema oneclick. Não recebe service-role nenhuma.
// Usa apenas a anon key do projeto de licenciamento.

import { z } from "npm:zod@3.23.8";
import { createServiceClient } from "../_shared/supabase.ts";
import { hashIp } from "../_shared/ip.ts";
import { checkAndIncrement } from "../_shared/rate-limit.ts";

const Body = z.object({
  email: z.string().email().max(200),
});

const ALLOWED_ORIGINS = new Set([
  "https://institutometrik.com.br",
  "https://1clickrender-help.vercel.app",
]);

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://institutometrik.com.br";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: cors });
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return new Response(JSON.stringify({ error: "invalid_body", detail: String(e) }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  // Rate-limit por IP: 20/hora. Gate é menos abusado que chat.
  try {
    const client = createServiceClient();
    const ip = await hashIp(req);
    const limit = await checkAndIncrement(client, `validate-access:${ip}`, 3600, 20);
    if (!limit.allowed) {
      return new Response(JSON.stringify({ error: "rate_limit" }), {
        status: 429,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }
  } catch (e) {
    // Falha no rate-limit não bloqueia o gate (fail-open). Log e segue.
    console.error("rate-limit check failed:", e);
  }

  const licensingUrl = Deno.env.get("LICENSING_SUPABASE_URL");
  const licensingKey = Deno.env.get("LICENSING_SUPABASE_ANON_KEY");
  if (!licensingUrl || !licensingKey) {
    console.error("missing LICENSING_SUPABASE_URL or LICENSING_SUPABASE_ANON_KEY");
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  let valid: boolean;
  try {
    const resp = await fetch(`${licensingUrl}/rest/v1/rpc/check_1cr_chat_access`, {
      method: "POST",
      headers: {
        "apikey": licensingKey,
        "Authorization": `Bearer ${licensingKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email_arg: body.email.trim().toLowerCase() }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error("licensing RPC non-ok:", resp.status, text);
      return new Response(JSON.stringify({ error: "licensing_unreachable" }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }
    const data = await resp.json();
    valid = data === true;
  } catch (e) {
    console.error("licensing RPC fetch failed:", e);
    return new Response(JSON.stringify({ error: "licensing_unreachable" }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  return new Response(JSON.stringify({ valid }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...cors },
  });
});
