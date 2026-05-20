import { createServiceClient } from "../_shared/supabase.ts";

const EMBED_MODEL = "text-embedding-004";
const SUMMARY_MODEL = "gemini-2.5-flash";

async function embed(text: string): Promise<number[]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY")!;
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: { parts: [{ text }] } }),
    },
  );
  const j = await r.json();
  return j.embedding.values;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function summarizeCluster(samples: string[]): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY")!;
  const prompt = `Resuma essas perguntas em UMA frase curta (max 12 palavras) que capture o tema comum. Responda APENAS com a frase, sem aspas.\n\n${samples.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${SUMMARY_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  );
  const j = await r.json();
  return j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "unknown cluster";
}

async function openGithubIssue(title: string, body: string): Promise<string | null> {
  const token = Deno.env.get("GITHUB_TOKEN");
  if (!token) return null;
  const r = await fetch("https://api.github.com/repos/METRIK-GROUP/1clickrender-help/issues", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, body, labels: ["kb-gap"] }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j.html_url ?? null;
}

Deno.serve(async (_req) => {
  const client = createServiceClient();
  const since = new Date(Date.now() - 86400_000).toISOString();

  const { data: userMsgs } = await client
    .from("messages")
    .select("id, content, created_at")
    .eq("role", "user")
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  if (!userMsgs || userMsgs.length === 0) {
    return new Response(JSON.stringify({ status: "no_messages" }), { status: 200 });
  }

  // Embed all
  const items: { id: string; text: string; emb: number[] }[] = [];
  for (const m of userMsgs) {
    try {
      items.push({ id: m.id, text: m.content, emb: await embed(m.content) });
    } catch { /* skip on embed failure */ }
  }

  // Greedy clustering
  const clusters: { samples: string[]; size: number }[] = [];
  const assigned = new Set<number>();
  for (let i = 0; i < items.length; i++) {
    if (assigned.has(i)) continue;
    const cluster = { samples: [items[i].text], size: 1 };
    assigned.add(i);
    for (let j = i + 1; j < items.length; j++) {
      if (assigned.has(j)) continue;
      if (cosine(items[i].emb, items[j].emb) > 0.85) {
        cluster.samples.push(items[j].text);
        cluster.size++;
        assigned.add(j);
      }
    }
    clusters.push(cluster);
  }

  clusters.sort((a, b) => b.size - a.size);

  // Calculate metrics
  const { data: assistantMsgs } = await client
    .from("messages")
    .select("id, latency_ms, tokens_in, tokens_out, session_id")
    .eq("role", "assistant")
    .gte("created_at", since);

  const { data: fbs } = await client
    .from("feedback")
    .select("rating")
    .gte("created_at", since);

  const conversationCount = new Set(assistantMsgs?.map((m) => m.session_id) ?? []).size;
  const totalMsgs = (userMsgs.length + (assistantMsgs?.length ?? 0));
  const pos = (fbs ?? []).filter((f) => f.rating === 1).length;
  const neg = (fbs ?? []).filter((f) => f.rating === -1).length;
  const satisfaction = pos + neg === 0 ? null : Math.round((pos / (pos + neg)) * 100);
  const avgLatency = (assistantMsgs ?? []).length
    ? Math.round((assistantMsgs ?? []).reduce((s, m) => s + (m.latency_ms ?? 0), 0) / assistantMsgs!.length)
    : 0;

  // Build report markdown
  const top10 = clusters.slice(0, 10);
  const reportLines = [
    `# 1CR Help — Diário ${new Date().toISOString().slice(0, 10)}`,
    "",
    "## Métricas",
    `- Conversas: ${conversationCount}`,
    `- Mensagens: ${totalMsgs}`,
    `- Satisfação: ${satisfaction === null ? "sem feedback" : satisfaction + "%"}`,
    `- Latência média: ${avgLatency}ms`,
    "",
    "## Top dúvidas",
  ];
  for (const c of top10) {
    const label = await summarizeCluster(c.samples.slice(0, 5));
    reportLines.push(`- ${label} (${c.size}x)`);
  }

  // Detect gaps (size >= 3 — for higher freq we open issues)
  const gaps = clusters.filter((c) => c.size >= 3);
  reportLines.push("", "## Gaps de KB detectados");
  for (const c of gaps) {
    const label = await summarizeCluster(c.samples.slice(0, 5));
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);

    // Upsert kb_gaps
    const { data: existing } = await client
      .from("kb_gaps")
      .select("id, frequency")
      .ilike("cluster_label", label)
      .eq("status", "open")
      .maybeSingle();

    let gapRow;
    if (existing) {
      const { data } = await client.from("kb_gaps").update({
        frequency: existing.frequency + c.size,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id).select().single();
      gapRow = data;
    } else {
      const { data } = await client.from("kb_gaps").insert({
        cluster_label: label,
        sample_questions: c.samples.slice(0, 5),
        frequency: c.size,
        suggested_kb_path: `kb/pt-br/${slug}.md`,
      }).select().single();
      gapRow = data;
    }

    let issueLink = gapRow?.github_issue_url;
    if (c.size >= 5 && !issueLink) {
      const url = await openGithubIssue(
        `[KB Gap] ${label}`,
        `Frequência últimas 24h: ${c.size}\n\nExemplos:\n${c.samples.slice(0, 5).map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\nSugestão de arquivo: \`kb/pt-br/${slug}.md\``,
      );
      if (url) {
        await client.from("kb_gaps").update({ github_issue_url: url }).eq("id", gapRow!.id);
        issueLink = url;
      }
    }
    reportLines.push(`- ${label} (${c.size}x)${issueLink ? ` → ${issueLink}` : ""}`);
  }

  const markdown = reportLines.join("\n");

  await client.from("daily_reports").upsert({
    report_date: new Date().toISOString().slice(0, 10),
    markdown_content: markdown,
    metrics: {
      conversations: conversationCount,
      messages: totalMsgs,
      satisfaction,
      latency_avg_ms: avgLatency,
      gaps: gaps.length,
    },
  }, { onConflict: "report_date" });

  return new Response(JSON.stringify({ status: "ok", clusters: clusters.length, gaps: gaps.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
