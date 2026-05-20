import { z } from "npm:zod@3.23.8";
import { createServiceClient } from "../_shared/supabase.ts";
import { hashIp } from "../_shared/ip.ts";
import { checkAndIncrement } from "../_shared/rate-limit.ts";
import { validateImageBase64 } from "../_shared/validate-image.ts";
import { loadKB } from "../_shared/kb-loader.ts";
import { systemPromptFor, type Lang } from "../_shared/i18n.ts";
import { callLLM } from "../_shared/llm.ts";
import { detectLeak } from "../_shared/anti-extraction.ts";

const Body = z.object({
  session_id: z.string().uuid().optional(),
  message: z.string().min(1).max(8000),
  image_base64: z.string().optional(),
  error_log: z.string().max(100_000).optional(),
  lang: z.enum(["pt-br", "en", "es"]).default("pt-br"),
});

const CORS = {
  "Access-Control-Allow-Origin": "https://institutometrik.com.br",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return new Response(JSON.stringify({ error: "invalid_body", detail: String(e) }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const client = createServiceClient();
  const ip = await hashIp(req);

  // Rate limit per IP (20/hour)
  const ipLimit = await checkAndIncrement(client, `ip:${ip}`, 3600, 20);
  if (!ipLimit.allowed) {
    return new Response(JSON.stringify({ error: "rate_limit_ip" }), {
      status: 429,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // Get or create session
  let sessionId = body.session_id;
  if (!sessionId) {
    const { data, error } = await client.from("sessions").insert({
      ip_hash: ip,
      lang: body.lang,
      user_agent: req.headers.get("user-agent") ?? "",
    }).select("id").single();
    if (error) {
      return new Response(JSON.stringify({ error: "session_create_failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }
    sessionId = data.id;
  } else {
    // Rate limit per session (60/day)
    const sessLimit = await checkAndIncrement(client, `session:${sessionId}`, 86400, 60);
    if (!sessLimit.allowed) {
      return new Response(JSON.stringify({ error: "rate_limit_session" }), {
        status: 429,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }
  }

  // Validate image if provided
  let image: { mime: string; base64: string } | undefined;
  if (body.image_base64) {
    const v = validateImageBase64(body.image_base64);
    if (!v.valid) {
      return new Response(JSON.stringify({ error: "invalid_image", reason: v.reason }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }
    const stripped = body.image_base64.startsWith("data:")
      ? body.image_base64.split(",")[1]!
      : body.image_base64;
    image = { mime: v.mime, base64: stripped };
  }

  // Load history (last 20 messages)
  const { data: historyRows } = await client
    .from("messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(20);
  const history = (historyRows ?? []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Build prompt
  const kb = await loadKB(body.lang as Lang);
  const system = systemPromptFor(body.lang as Lang, kb);
  const userMessage = body.error_log
    ? `${body.message}\n\n---LOG DE ERRO---\n${body.error_log.slice(0, 100_000)}`
    : body.message;

  // Persist user message NOW (before streaming)
  const userInsert = await client.from("messages").insert({
    session_id: sessionId,
    role: "user",
    content: body.message,
    has_image: !!image,
    error_log_excerpt: body.error_log?.slice(0, 2048),
  }).select("id").single();

  // Stream response
  const start = Date.now();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`event: session\ndata: ${JSON.stringify({ session_id: sessionId })}\n\n`));
      let full = "";
      try {
        for await (const chunk of callLLM({ system, history, userMessage, lang: body.lang as Lang, image })) {
          full += chunk;
          const leak = detectLeak(full, kb);
          if (leak.leak) {
            const replacement = "Desculpe, não posso responder essa pergunta. Posso ajudar com outra coisa?";
            controller.enqueue(encoder.encode(`event: replace\ndata: ${JSON.stringify({ text: replacement })}\n\n`));
            full = replacement;
            break;
          }
          controller.enqueue(encoder.encode(`event: chunk\ndata: ${JSON.stringify({ text: chunk })}\n\n`));
        }
        // Persist assistant message BEFORE sending done event so we can include message_id
        const { data: inserted } = await client.from("messages").insert({
          session_id: sessionId,
          role: "assistant",
          content: full,
          latency_ms: Date.now() - start,
        }).select("id").single();
        controller.enqueue(
          encoder.encode(`event: done\ndata: ${JSON.stringify({ message_id: inserted?.id ?? null })}\n\n`),
        );
      } catch (e) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: String(e) })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      ...CORS,
    },
  });
  } catch (outerErr) {
    console.error("CHAT_HANDLER_ERROR", outerErr, (outerErr as Error)?.stack);
    return new Response(
      JSON.stringify({ error: "internal", detail: String(outerErr), stack: (outerErr as Error)?.stack }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }
});
