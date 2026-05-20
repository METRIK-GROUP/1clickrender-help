import type { Lang } from "./i18n.ts";

let cache: Record<Lang, string> | null = null;

export async function loadKB(lang: Lang, path = "./kb-cache.json"): Promise<string> {
  if (!cache) {
    const text = await Deno.readTextFile(path);
    cache = JSON.parse(text);
  }
  return cache![lang] ?? "";
}

export function resetKBCache(): void {
  cache = null;
}
