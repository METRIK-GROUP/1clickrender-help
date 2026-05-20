import { z } from "npm:zod@3.23.8";
import { signJWT } from "../_shared/auth.ts";

const Body = z.object({ password: z.string() });

const CORS = {
  "Access-Control-Allow-Origin": "https://help.institutometrik.com.br",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Credentials": "true",
};

// Constant-time string comparison
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const expected = Deno.env.get("ADMIN_PASSWORD") ?? "";
  if (!expected) return new Response("server misconfig", { status: 500 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return new Response(JSON.stringify({ error: "invalid_body" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  if (!timingSafeEqual(body.password, expected)) {
    return new Response(JSON.stringify({ error: "invalid_password" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const token = await signJWT({ admin: true }, 8 * 3600);
  const cookie = `admin_token=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${8 * 3600}`;

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookie,
      ...CORS,
    },
  });
});
