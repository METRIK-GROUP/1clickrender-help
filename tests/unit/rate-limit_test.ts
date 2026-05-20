import { assertEquals } from "std/assert/mod.ts";
import { checkAndIncrement } from "../../supabase/functions/_shared/rate-limit.ts";

// In-memory mock supabase client
function mockClient() {
  const store = new Map<string, { window_start: string; count: number }>();
  return {
    store,
    from(_t: string) {
      return {
        upsert: (row: { key: string; window_start: string; count: number }) => {
          store.set(row.key, { window_start: row.window_start, count: row.count });
          return { error: null };
        },
        select: (_c: string) => ({
          eq: (_col: string, val: string) => ({
            maybeSingle: () => ({
              data: store.get(val) ?? null,
              error: null,
            }),
          }),
        }),
        update: (patch: { count: number }) => ({
          eq: (_col: string, val: string) => {
            const row = store.get(val);
            if (row) store.set(val, { ...row, count: patch.count });
            return { error: null };
          },
        }),
      };
    },
  };
}

Deno.test("checkAndIncrement allows first request", async () => {
  const c = mockClient();
  // deno-lint-ignore no-explicit-any
  const r = await checkAndIncrement(c as any, "ip:abc", 3600, 20);
  assertEquals(r.allowed, true);
  assertEquals(r.remaining, 19);
});

Deno.test("checkAndIncrement blocks when limit exceeded", async () => {
  const c = mockClient();
  for (let i = 0; i < 20; i++) {
    // deno-lint-ignore no-explicit-any
    await checkAndIncrement(c as any, "ip:full", 3600, 20);
  }
  // deno-lint-ignore no-explicit-any
  const r = await checkAndIncrement(c as any, "ip:full", 3600, 20);
  assertEquals(r.allowed, false);
  assertEquals(r.remaining, 0);
});

Deno.test("checkAndIncrement resets after window", async () => {
  const c = mockClient();
  c.store.set("ip:expired", {
    window_start: new Date(Date.now() - 7200_000).toISOString(),
    count: 99,
  });
  // deno-lint-ignore no-explicit-any
  const r = await checkAndIncrement(c as any, "ip:expired", 3600, 20);
  assertEquals(r.allowed, true);
  assertEquals(r.remaining, 19);
});
