import { create, getNumericDate, verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

async function getKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("JWT_SECRET");
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET missing or too short (need 32+ chars)");
  }
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signJWT(
  payload: Record<string, unknown>,
  ttlSeconds: number,
): Promise<string> {
  const key = await getKey();
  const now = Math.floor(Date.now() / 1000);
  const exp = ttlSeconds <= 0 ? now - 1 : now + ttlSeconds;
  return await create(
    { alg: "HS256", typ: "JWT" },
    { ...payload, exp, iat: now },
    key,
  );
}

export async function verifyJWT(token: string): Promise<Record<string, unknown>> {
  const key = await getKey();
  try {
    return await verify(token, key) as Record<string, unknown>;
  } catch (e) {
    if (String(e).includes("exp")) throw new Error("expired");
    throw e;
  }
}
