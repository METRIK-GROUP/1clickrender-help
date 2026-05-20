import { z } from "npm:zod@3.23.8";
import { createServiceClient } from "../_shared/supabase.ts";
import { signJWT } from "../_shared/auth.ts";
import { hashIp } from "../_shared/ip.ts";

const Body = z.object({
  license_id: z.string().min(1).max(200),
  sketchup_version: z.string().max(50),
  last_error: z.string().max(2000).optional(),
  os: z.string().max(50),
  plugin_version: z.string().max(50),
  lang: z.enum(["pt-br", "en", "es"]).default("pt-br"),
});

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return new Response(JSON.stringify({ error: "invalid_body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // NOTE: license_id is used to log audit trail but NOT stored in plugin_context (PII policy)
  // Future: validate license_id against IPDP-Desafio project here

  const client = createServiceClient();
  const ip = await hashIp(req);
  const { data: sess, error } = await client.from("sessions").insert({
    ip_hash: ip,
    lang: body.lang,
    plugin_context: {
      sketchup_version: body.sketchup_version,
      last_error: body.last_error,
      os: body.os,
      plugin_version: body.plugin_version,
    },
    user_agent: req.headers.get("user-agent") ?? "plugin",
  }).select("id").single();

  if (error) {
    return new Response(JSON.stringify({ error: "session_create_failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const token = await signJWT({ session_id: sess.id }, 3600);
  await client.from("sessions").update({ token }).eq("id", sess.id);

  return new Response(
    JSON.stringify({
      token,
      url: `https://institutometrik.com.br/1clickrender-help/?t=${encodeURIComponent(token)}`,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
