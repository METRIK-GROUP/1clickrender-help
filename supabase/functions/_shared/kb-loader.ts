import type { Lang } from "./i18n.ts";
import { KB_CACHE } from "./kb-cache.ts";

let cache: Record<Lang, string> | null = null;

export async function loadKB(lang: Lang, path?: string): Promise<string> {
  if (path) {
    // Test/dev override: read from JSON file
    if (!cache) {
      const text = await Deno.readTextFile(path);
      cache = JSON.parse(text);
    }
    return cache![lang] ?? "";
  }
  // Production: use bundled TS module
  return KB_CACHE[lang] ?? "";
}

export function resetKBCache(): void {
  cache = null;
}
