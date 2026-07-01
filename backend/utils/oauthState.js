import crypto from "crypto";

export function createSignedOAuthState(provider, secret) {
  const payload = {
    provider,
    nonce: crypto.randomBytes(16).toString("hex"),
    createdAt: Date.now()
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

export function verifySignedOAuthState(state, provider, secret, maxAgeMs = 10 * 60 * 1000) {
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
    return payload.provider === provider && Date.now() - payload.createdAt <= maxAgeMs;
  } catch {
    return false;
  }
}
