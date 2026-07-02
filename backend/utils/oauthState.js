import crypto from "crypto";

export function createSignedOAuthState(provider, secret, extra = {}) {
  const payload = {
    provider,
    nonce: crypto.randomBytes(16).toString("hex"),
    createdAt: Date.now(),
    ...extra
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

export function verifySignedOAuthState(state, provider, secret, maxAgeMs = 10 * 60 * 1000) {
  return Boolean(readSignedOAuthState(state, provider, secret, maxAgeMs));
}

export function readSignedOAuthState(state, provider, secret, maxAgeMs = 10 * 60 * 1000) {
  if (!state || typeof state !== "string" || !secret) return false;

  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) return false;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");

  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (payload.provider !== provider || Date.now() - payload.createdAt > maxAgeMs) return null;
    return payload;
  } catch {
    return null;
  }
}
