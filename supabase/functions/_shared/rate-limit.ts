import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type RateLimitResult = { allowed: boolean; remaining: number };

export async function checkAndIncrement(
  client: SupabaseClient,
  key: string,
  windowSeconds: number,
  maxCount: number,
): Promise<RateLimitResult> {
  const now = new Date();
  const windowMs = windowSeconds * 1000;

  const { data: existing } = await client
    .from("rate_limit")
    .select("window_start, count")
    .eq("key", key)
    .maybeSingle();

  if (!existing) {
    await client.from("rate_limit").upsert({
      key,
      window_start: now.toISOString(),
      count: 1,
    });
    return { allowed: true, remaining: maxCount - 1 };
  }

  const windowStart = new Date(existing.window_start);
  const expired = now.getTime() - windowStart.getTime() > windowMs;

  if (expired) {
    await client.from("rate_limit").upsert({
      key,
      window_start: now.toISOString(),
      count: 1,
    });
    return { allowed: true, remaining: maxCount - 1 };
  }

  if (existing.count >= maxCount) {
    return { allowed: false, remaining: 0 };
  }

  const newCount = existing.count + 1;
  await client.from("rate_limit").update({ count: newCount }).eq("key", key);
  return { allowed: true, remaining: maxCount - newCount };
}
