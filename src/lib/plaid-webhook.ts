import { createHash } from "node:crypto";
import * as jose from "jose";
import { plaid } from "@/lib/plaid";

// Plaid signs each webhook with a JWS (ES256) in the "Plaid-Verification"
// header. The body's SHA-256 is included in the JWS payload, so we can prove
// both authenticity and integrity. Docs:
//   https://plaid.com/docs/api/webhooks/webhook-verification/

const keyCache = new Map<string, jose.KeyObject | CryptoKey>();
const MAX_SKEW_MS = 5 * 60 * 1000; // 5 minutes

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string };

export async function verifyPlaidWebhook(
  req: Request,
  rawBody: string,
): Promise<VerifyResult> {
  const jws = req.headers.get("plaid-verification");
  if (!jws) return { ok: false, reason: "missing Plaid-Verification header" };

  let protectedHeader: jose.ProtectedHeaderParameters;
  try {
    protectedHeader = jose.decodeProtectedHeader(jws);
  } catch {
    return { ok: false, reason: "malformed JWS header" };
  }

  const kid = protectedHeader.kid;
  if (!kid) return { ok: false, reason: "missing kid" };
  if (protectedHeader.alg !== "ES256") {
    return { ok: false, reason: `unexpected alg ${protectedHeader.alg}` };
  }

  let key = keyCache.get(kid);
  if (!key) {
    try {
      const res = await plaid.webhookVerificationKeyGet({ key_id: kid });
      const jwk = res.data.key as unknown as jose.JWK;
      key = (await jose.importJWK(jwk, "ES256")) as jose.KeyObject | CryptoKey;
      keyCache.set(kid, key);
    } catch (e) {
      return {
        ok: false,
        reason: `failed to fetch verification key: ${(e as Error).message}`,
      };
    }
  }

  let payload: jose.JWTPayload;
  try {
    const verified = await jose.jwtVerify(jws, key, { algorithms: ["ES256"] });
    payload = verified.payload;
  } catch (e) {
    return { ok: false, reason: `JWS verify failed: ${(e as Error).message}` };
  }

  // iat freshness
  const iat = payload.iat;
  if (typeof iat !== "number") {
    return { ok: false, reason: "missing iat" };
  }
  const ageMs = Date.now() - iat * 1000;
  if (ageMs > MAX_SKEW_MS || ageMs < -MAX_SKEW_MS) {
    return { ok: false, reason: `iat skew ${ageMs}ms` };
  }

  // body hash
  const claimed = (payload as { request_body_sha256?: string })
    .request_body_sha256;
  if (typeof claimed !== "string") {
    return { ok: false, reason: "missing request_body_sha256 claim" };
  }
  const actual = createHash("sha256").update(rawBody).digest("hex");
  if (
    actual.length !== claimed.length ||
    !timingSafeStringEq(actual, claimed)
  ) {
    return { ok: false, reason: "body hash mismatch" };
  }

  return { ok: true };
}

function timingSafeStringEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
