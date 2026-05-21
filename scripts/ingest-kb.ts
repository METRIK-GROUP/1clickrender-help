// Ingest the canonical KB from the Drive _publico folder into Supabase kb_docs (pgvector).
// Reads .md files (and viewport-guide.html), chunks them, embeds via Gemini text-embedding-004,
// and upserts into kb_docs. Skips two files that are ALWAYS injected as fixed context:
// tom-de-voz-do-assistente.md and perguntas-frequentes-e-erros.md.
//
// Usage:
//   GEMINI_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     deno run --allow-env --allow-read --allow-net scripts/ingest-kb.ts
//
// Optional: --dry to skip upsert, --root <path> to override KB path, --limit N to ingest first N files.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const DEFAULT_ROOT =
  "/Users/rodrigorosar/Library/CloudStorage/GoogleDrive-rodrigo@rodrigorosar.com.br/Meu Drive/METRIK I Instituto/Obsidian + Claude/O Cérebro/40 Metrik Instituto/41 Cursos/1 Click Render/_publico";

const CHUNK_CHARS = 1500;
const CHUNK_OVERLAP = 200;
const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIM = 768;
const EMBED_DELAY_MS = 700; // ~85 RPM safety margin (free tier is 100 RPM)

// Files NEVER ingested via RAG (always injected as fixed context)
const FIXED_CONTEXT_FILES = new Set([
  "tom-de-voz-do-assistente.md",
  "perguntas-frequentes-e-erros.md",
]);

// Zero-leak audit patterns (from _publico-MANIFEST.md)
const LEAK_PATTERNS = [
  /mofuvnzv/,
  /1cr@metrikdesign/,
  /\b0132\b/,
  /ONECLICK_DEV_MODE/,
  /webhook_secret/,
  /support_overrides/,
  /eyJhbGciOi/,
  /\brt\.dat\b/,
  /metrik-engine/,
  /EngineCache/,
  /\bXOR\b/,
];

const args = new Set(Deno.args);
const dryRun = args.has("--dry");
const rootIdx = Deno.args.indexOf("--root");
const rootPath = rootIdx >= 0 ? Deno.args[rootIdx + 1] : DEFAULT_ROOT;
const limitIdx = Deno.args.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(Deno.args[limitIdx + 1]) : Infinity;

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");
if (!dryRun && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)) {
  throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing (or pass --dry)");
}

const client = dryRun ? null : createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

type FileEntry = { absPath: string; relPath: string };

async function walkMarkdown(dir: string, root: string, out: FileEntry[]): Promise<void> {
  for await (const e of Deno.readDir(dir)) {
    const abs = `${dir}/${e.name}`;
    if (e.isDirectory) {
      await walkMarkdown(abs, root, out);
    } else if (e.isFile && (e.name.endsWith(".md") || e.name.endsWith(".html"))) {
      const rel = abs.startsWith(root + "/") ? abs.slice(root.length + 1) : abs;
      out.push({ absPath: abs, relPath: rel });
    }
  }
}

function chunkText(text: string): string[] {
  if (text.length <= CHUNK_CHARS) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_CHARS, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}

function auditLeak(content: string, relPath: string): string[] {
  const hits: string[] = [];
  for (const p of LEAK_PATTERNS) {
    if (p.test(content)) hits.push(`${p.source} in ${relPath}`);
  }
  return hits;
}

async function embedOne(text: string, retries = 8): Promise<number[]> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  const body = {
    model: `models/${EMBED_MODEL}`,
    content: { parts: [{ text }] },
    outputDimensionality: EMBED_DIM,
    taskType: "RETRIEVAL_DOCUMENT",
  };
  let lastErr: string | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (resp.ok) {
      const j = await resp.json();
      return j.embedding.values;
    }
    lastErr = `${resp.status}: ${await resp.text()}`;
    if (resp.status === 429 || resp.status >= 500) {
      const wait = Math.min(2 ** attempt * 1000, 30_000);
      console.warn(`[ingest-kb] embed retry ${attempt + 1} after ${wait}ms (${resp.status})`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    break;
  }
  throw new Error(`Embed failed: ${lastErr}`);
}

async function main() {
  console.log(`[ingest-kb] root: ${rootPath}`);
  console.log(`[ingest-kb] mode: ${dryRun ? "DRY (no upsert)" : "LIVE"}`);

  const files: FileEntry[] = [];
  await walkMarkdown(rootPath, rootPath, files);
  files.sort((a, b) => a.relPath.localeCompare(b.relPath));

  console.log(`[ingest-kb] found ${files.length} files`);

  let leakHits: string[] = [];
  const records: {
    path: string;
    chunk_idx: number;
    content: string;
    lang: string;
    char_count: number;
  }[] = [];

  let countSkipped = 0;
  let processed = 0;
  for (const f of files) {
    if (FIXED_CONTEXT_FILES.has(f.relPath)) {
      countSkipped++;
      continue;
    }
    if (processed >= limit) break;
    const content = await Deno.readTextFile(f.absPath);
    leakHits.push(...auditLeak(content, f.relPath));
    const chunks = chunkText(content);
    chunks.forEach((c, i) => {
      records.push({
        path: f.relPath,
        chunk_idx: i,
        content: c,
        lang: "pt-br",
        char_count: c.length,
      });
    });
    processed++;
  }

  console.log(`[ingest-kb] processed ${processed} files (${countSkipped} skipped as fixed-context)`);
  console.log(`[ingest-kb] total chunks: ${records.length}`);

  if (leakHits.length > 0) {
    console.error(`[ingest-kb] ABORT: zero-leak audit failed:`);
    for (const h of leakHits) console.error(`  - ${h}`);
    Deno.exit(2);
  }
  console.log(`[ingest-kb] zero-leak audit: clean`);

  if (dryRun) {
    console.log(`[ingest-kb] DRY mode: stopping before embed.`);
    return;
  }

  // Resumable: load already-ingested (path, chunk_idx) pairs and skip them.
  const resume = !args.has("--wipe");
  let alreadyDone = new Set<string>();
  if (resume) {
    console.log(`[ingest-kb] resume mode: loading existing kb_docs keys...`);
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await client!.from("kb_docs")
        .select("path, chunk_idx")
        .eq("lang", "pt-br")
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const r of data) alreadyDone.add(`${r.path}::${r.chunk_idx}`);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    console.log(`[ingest-kb] resume: ${alreadyDone.size} chunks already ingested, skipping`);
  } else {
    console.log(`[ingest-kb] --wipe specified: clearing existing kb_docs...`);
    const { error: delErr } = await client!.from("kb_docs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (delErr) throw delErr;
  }

  // Embed (one-by-one) + upsert in DB batches of 50
  const DB_BATCH = 50;
  let pending: {
    path: string;
    chunk_idx: number;
    content: string;
    embedding: number[];
    lang: string;
    char_count: number;
  }[] = [];
  let totalIngested = 0;
  const startTs = Date.now();

  async function flushPending() {
    if (pending.length === 0) return;
    const { error } = await client!.from("kb_docs").insert(pending);
    if (error) {
      console.error(`[ingest-kb] insert failed:`, error);
      throw error;
    }
    totalIngested += pending.length;
    const elapsed = ((Date.now() - startTs) / 1000).toFixed(0);
    const rps = (totalIngested / Math.max(1, (Date.now() - startTs) / 1000)).toFixed(1);
    console.log(`[ingest-kb] +${pending.length} rows (total ${totalIngested}/${records.length} · ${elapsed}s · ${rps} rps)`);
    pending = [];
  }

  let skipped = 0;
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const key = `${r.path}::${r.chunk_idx}`;
    if (alreadyDone.has(key)) {
      skipped++;
      continue;
    }
    const emb = await embedOne(r.content);
    pending.push({
      path: r.path,
      chunk_idx: r.chunk_idx,
      content: r.content,
      embedding: emb,
      lang: r.lang,
      char_count: r.char_count,
    });
    if (pending.length >= DB_BATCH) await flushPending();
    await new Promise((res) => setTimeout(res, EMBED_DELAY_MS));
  }
  await flushPending();
  console.log(`[ingest-kb] resume skipped: ${skipped} already-done chunks`);

  console.log(`[ingest-kb] DONE: ${totalIngested} chunks ingested.`);
}

await main();
