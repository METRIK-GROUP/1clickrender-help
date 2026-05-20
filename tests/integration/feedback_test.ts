import { assertEquals } from "std/assert/mod.ts";
import { createClient } from "supabase";

const URL = Deno.env.get("EDGE_BASE_URL") ?? "http://localhost:54321/functions/v1";

Deno.test({
  name: "POST /feedback persists rating",
  ignore: !Deno.env.get("RUN_INTEGRATION"),
  fn: async () => {
    const c = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: sess } = await c.from("sessions").insert({ ip_hash: "test", lang: "pt-br" }).select("id").single();
    const { data: msg } = await c.from("messages").insert({
      session_id: sess!.id,
      role: "assistant",
      content: "hi",
    }).select("id").single();

    const resp = await fetch(`${URL}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: msg!.id, rating: 1, comment: "great" }),
    });
    assertEquals(resp.status, 201);

    const { data: f } = await c.from("feedback").select("*").eq("message_id", msg!.id).single();
    assertEquals(f!.rating, 1);
    assertEquals(f!.comment, "great");
  },
});

Deno.test({
  name: "POST /feedback rejects invalid rating",
  ignore: !Deno.env.get("RUN_INTEGRATION"),
  fn: async () => {
    const resp = await fetch(`${URL}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: crypto.randomUUID(), rating: 99 }),
    });
    assertEquals(resp.status, 400);
  },
});
