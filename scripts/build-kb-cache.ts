const LANGS = ["pt-br", "en", "es"];
const ROOT = new URL("../kb/", import.meta.url).pathname;
const OUT = new URL("../supabase/functions/chat/kb-cache.json", import.meta.url).pathname;

const out: Record<string, string> = {};

for (const lang of LANGS) {
  const dir = `${ROOT}${lang}`;
  try {
    const entries = [];
    for await (const e of Deno.readDir(dir)) {
      if (e.isFile && e.name.endsWith(".md")) entries.push(e.name);
    }
    entries.sort((a, b) => a.localeCompare(b));
    const parts: string[] = [];
    for (const name of entries) {
      const content = await Deno.readTextFile(`${dir}/${name}`);
      parts.push(`## [${name}]\n${content}`);
    }
    out[lang] = parts.join("\n\n");
  } catch {
    out[lang] = "";
  }
}

await Deno.writeTextFile(OUT, JSON.stringify(out, null, 2));
console.log(`Built KB cache: ${Object.entries(out).map(([k, v]) => `${k}=${v.length}ch`).join(", ")}`);

// Copy to other function dirs that need it
for (const fn of ["summarize-daily"]) {
  const dest = new URL(`../supabase/functions/${fn}/kb-cache.json`, import.meta.url).pathname;
  await Deno.copyFile(OUT, dest);
}
