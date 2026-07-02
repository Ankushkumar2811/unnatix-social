import express from "express";
import axios from "axios";
import crypto from "crypto";
import "../config/env.js";
import { nanoid } from "nanoid";
import { db } from "../db.js";
import { createSignedOAuthState, readSignedOAuthState } from "../utils/oauthState.js";

const router = express.Router();

const {
  META_APP_ID,
  META_APP_SECRET,
  META_REDIRECT_URI,
  FRONTEND_URL
} = process.env;

const GRAPH = "https://graph.facebook.com/v19.0";
const META_OAUTH_DIALOG = "https://www.facebook.com/v19.0/dialog/oauth";
const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management"
];
const META_CONNECT_INTENTS = new Set(["all", "facebook", "instagram"]);

function getMetaStateKey() {
  return crypto.createHash("sha256").update(META_APP_SECRET).digest();
}

function encryptMetaSelection(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getMetaStateKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function decryptMetaSelection(token) {
  if (!token || typeof token !== "string") return null;
  try {
    const input = Buffer.from(token, "base64url");
    const iv = input.subarray(0, 12);
    const tag = input.subarray(12, 28);
    const encrypted = input.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", getMetaStateKey(), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    const payload = JSON.parse(decrypted);
    const maxAgeMs = 30 * 60 * 1000;
    if (Date.now() - new Date(payload.createdAt).getTime() > maxAgeMs) return null;
    return payload;
  } catch {
    return null;
  }
}

function safeMetaSelection(connection, token) {
  return {
    id: token,
    provider: connection.provider,
    intent: connection.intent,
    candidates: connection.candidates.map(({ accessToken, ...candidate }) => candidate),
    createdAt: connection.createdAt
  };
}

// Step 1: Redirect user to Meta login/consent screen
router.get("/auth/meta", (req, res) => {
  if (!META_APP_ID || !META_APP_SECRET || !META_REDIRECT_URI) {
    console.error("[meta-oauth] Missing Meta OAuth configuration");
    return res.status(500).send("Meta OAuth is not configured.");
  }

  const intent = META_CONNECT_INTENTS.has(req.query.intent) ? req.query.intent : "all";
  const params = new URLSearchParams({
    client_id: META_APP_ID,
    redirect_uri: META_REDIRECT_URI,
    scope: META_SCOPES.join(","),
    response_type: "code",
    state: createSignedOAuthState("meta", META_APP_SECRET, { intent })
  });

  res.redirect(`${META_OAUTH_DIALOG}?${params.toString()}`);
});

// Step 2: Meta redirects back here with a ?code=
router.get("/auth/meta/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send("Missing code from Meta");
  const oauthState = readSignedOAuthState(state, "meta", META_APP_SECRET);
  if (!oauthState) {
    console.error("[meta-oauth] Invalid OAuth state");
    return res.status(400).send("Invalid OAuth state");
  }
  const intent = META_CONNECT_INTENTS.has(oauthState.intent) ? oauthState.intent : "all";

  try {
    // Exchange code for short-lived user token
    const tokenRes = await axios.get(`${GRAPH}/oauth/access_token`, {
      params: {
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        redirect_uri: META_REDIRECT_URI,
        code
      }
    });
    const shortLivedToken = tokenRes.data.access_token;

    // Exchange for long-lived user token (~60 days)
    const longRes = await axios.get(`${GRAPH}/oauth/access_token`, {
      params: {
        grant_type: "fb_exchange_token",
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        fb_exchange_token: shortLivedToken
      }
    });
    const userToken = longRes.data.access_token;

    // Get the Pages this user manages (each Page token does not expire while user token is valid)
    const pagesRes = await axios.get(`${GRAPH}/me/accounts`, {
      params: { access_token: userToken }
    });

    const candidates = [];

    for (const page of pagesRes.data.data) {
      if (intent === "all" || intent === "facebook") {
        candidates.push({
          candidateId: `facebook:${page.id}`,
          platform: "facebook",
          name: page.name,
          accessToken: page.access_token,
          meta: { pageId: page.id, connectType: "page" }
        });
      }

      if (intent === "all" || intent === "instagram") {
        try {
          const igRes = await axios.get(`${GRAPH}/${page.id}`, {
            params: {
              fields: "instagram_business_account",
              access_token: page.access_token
            }
          });
          const igId = igRes.data.instagram_business_account?.id;
          if (igId) {
            const igInfo = await axios.get(`${GRAPH}/${igId}`, {
              params: { fields: "username", access_token: page.access_token }
            });
            candidates.push({
              candidateId: `instagram:${igId}`,
              platform: "instagram",
              name: igInfo.data.username,
              accessToken: page.access_token, // IG publishing uses the Page token
              meta: { igId, pageId: page.id, pageName: page.name, connectType: "business" }
            });
          }
        } catch (e) {
          // No IG account linked to this page, ignore
        }
      }
    }

    const pendingConnection = {
      id: nanoid(),
      provider: "meta",
      intent,
      candidates,
      createdAt: new Date().toISOString()
    };
    res.redirect(`${FRONTEND_URL}/?selectMeta=${encryptMetaSelection(pendingConnection)}`);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Meta OAuth failed. Check server logs.");
  }
});

router.get("/auth/meta/pending/:id", async (req, res) => {
  const connection = decryptMetaSelection(req.params.id);
  if (!connection) {
    return res.status(404).json({ error: "Pending Meta connection not found or expired" });
  }
  res.json(safeMetaSelection(connection, req.params.id));
});

router.post("/auth/meta/confirm", async (req, res) => {
  const { pendingId, candidateIds } = req.body;
  if (!pendingId || !Array.isArray(candidateIds)) {
    return res.status(400).json({ error: "pendingId and candidateIds are required" });
  }

  const connection = decryptMetaSelection(pendingId);
  if (!connection) {
    return res.status(404).json({ error: "Pending Meta connection not found or expired" });
  }

  const selectedIds = new Set(candidateIds);
  const selected = connection.candidates.filter((candidate) => selectedIds.has(candidate.candidateId));

  await db.read();
  for (const candidate of selected) {
    const existing = db.data.accounts.find((account) => {
      if (candidate.platform === "facebook") {
        return account.platform === "facebook" && account.meta?.pageId === candidate.meta.pageId;
      }
      if (candidate.platform === "instagram") {
        return account.platform === "instagram" && account.meta?.igId === candidate.meta.igId;
      }
      return false;
    });

    const account = {
      id: existing?.id || nanoid(),
      platform: candidate.platform,
      name: candidate.name,
      accessToken: candidate.accessToken,
      meta: candidate.meta
    };
    if (existing) Object.assign(existing, account);
    else db.data.accounts.push(account);
  }

  await db.write();
  res.json({ success: true, connected: selected.length });
});

// Post to a Facebook Page (text + optional image URL)
router.post("/post/facebook/:accountId", async (req, res) => {
  const { accountId } = req.params;
  const { message, imageUrl } = req.body;

  await db.read();
  const account = db.data.accounts.find((a) => a.id === accountId);
  if (!account) return res.status(404).json({ error: "Account not found" });

  try {
    const endpoint = imageUrl
      ? `${GRAPH}/${account.meta.pageId}/photos`
      : `${GRAPH}/${account.meta.pageId}/feed`;

    const payload = imageUrl
      ? { url: imageUrl, caption: message, access_token: account.accessToken }
      : { message, access_token: account.accessToken };

    const result = await axios.post(endpoint, null, { params: payload });
    res.json({ success: true, result: result.data });
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Post to Instagram (requires an image/video URL — IG does not support text-only posts)
router.post("/post/instagram/:accountId", async (req, res) => {
  const { accountId } = req.params;
  const { caption, imageUrl } = req.body;

  if (!imageUrl) {
    return res.status(400).json({ error: "Instagram posts require an imageUrl" });
  }

  await db.read();
  const account = db.data.accounts.find((a) => a.id === accountId);
  if (!account) return res.status(404).json({ error: "Account not found" });

  try {
    // Step 1: Create media container
    const containerRes = await axios.post(
      `${GRAPH}/${account.meta.igId}/media`,
      null,
      { params: { image_url: imageUrl, caption, access_token: account.accessToken } }
    );

    // Step 2: Publish the container
    const publishRes = await axios.post(
      `${GRAPH}/${account.meta.igId}/media_publish`,
      null,
      {
        params: {
          creation_id: containerRes.data.id,
          access_token: account.accessToken
        }
      }
    );

    res.json({ success: true, result: publishRes.data });
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

export default router;
