import { assert, assertEquals } from "std/assert/mod.ts";
import { createClient } from "supabase";

Deno.test({
  name: "summarize-daily creates daily_report and gaps",
  ignore: !Deno.env.get("RUN_INTEGRATION"),
  fn: async () => {
    const c = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Seed fixtures
    const { data: sess } = await c.from("sessions").insert({ ip_hash: "test", lang: "pt-br" }).select("id").single();
    const msgs = JSON.parse(await Deno.readTextFile("tests/fixtures/messages.json"));
    for (const m of msgs) {
      const { data } = await c.from("messages").insert({
        session_id: sess!.id,
        role: m.role,
        content: m.content,
      }).select("id").single();
      if (m.feedback) {
        await c.from("feedback").insert({ message_id: data!.id, rating: m.feedback });
      }
    }

    // Invoke
    const resp = await fetch(`${Deno.env.get("EDGE_BASE_URL")}/summarize-daily`, {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: "{}",
    });
    assertEquals(resp.status, 200);

    const today = new Date().toISOString().slice(0, 10);
    const { data: report } = await c.from("daily_reports").select("*").eq("report_date", today).single();
    assert(report);
    assert(report.markdown_content.includes("Top"));

    const { data: gaps } = await c.from("kb_gaps").select("*").eq("status", "open");
    assert(gaps!.length >= 1, "should have detected at least 1 gap (Lumion)");
  },
});
