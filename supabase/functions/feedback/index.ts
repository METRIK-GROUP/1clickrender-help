import { z } from "zod";
import { createServiceClient } from "../_shared/supabase.ts";

const Body = z.object({
  message_id: z.string().uuid(),
  rating: z.union([z.literal(1), z.literal(-1)]),
  comment: z.string().max(2000).optional(),
});

const CORS = {
  "Access-Control-Allow-Origin": "https://help.1clickrender.com.br",
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

  const client = createServiceClient();
  const { data: msg } = await client.from("messages").select("id, created_at").eq("id", body.message_id).single();
  if (!msg) {
    return new Response(JSON.stringify({ error: "message_not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
  const ageMs = Date.now() - new Date(msg.created_at).getTime();
  if (ageMs > 7 * 86400_000) {
    return new Response(JSON.stringify({ error: "too_old" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const { error } = await client.from("feedback").insert({
    message_id: body.message_id,
    rating: body.rating,
    comment: body.comment,
  });
  if (error) {
    return new Response(JSON.stringify({ error: "db_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 201,
    headers: { "Content-Type": "application/json", ...CORS },
  });
});
