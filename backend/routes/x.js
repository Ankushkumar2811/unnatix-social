import express from "express";
import axios from "axios";
import crypto from "crypto";
import { nanoid } from "nanoid";
import { db } from "../db.js";

const router = express.Router();
const authSessions = new Map();

const {
  X_CLIENT_ID,
  X_CLIENT_SECRET,
  X_REDIRECT_URI,
  FRONTEND_URL
} = process.env;

const X_API = "https://api.x.com/2";
const X_AUTH = "https://x.com/i/oauth2/authorize";

function base64Url(input) {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function getBasicAuthHeader() {
  if (!X_CLIENT_SECRET) return {};
  const credentials = Buffer.from(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`).toString("base64");
  return { Authorization: `Basic ${credentials}` };
}

async function tokenRequest(data) {
  const body = new URLSearchParams(data);
  return axios.post(`${X_API}/oauth2/token`, body, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...getBasicAuthHeader()
    }
  });
}

router.get("/auth/x", (req, res) => {
  if (!X_CLIENT_ID || !X_REDIRECT_URI) {
    return res.status(500).send("X OAuth env vars missing. Add X_CLIENT_ID and X_REDIRECT_URI.");
  }

  const state = nanoid();
  const codeVerifier = base64Url(crypto.randomBytes(32));
  const codeChallenge = base64Url(crypto.createHash("sha256").update(codeVerifier).digest());

  authSessions.set(state, { codeVerifier, createdAt: Date.now() });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: X_CLIENT_ID,
    redirect_uri: X_REDIRECT_URI,
    scope: "tweet.read tweet.write users.read offline.access",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256"
  });

  res.redirect(`${X_AUTH}?${params.toString()}`);
});

router.get("/auth/x/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).send("Missing code/state from X");

  const session = authSessions.get(state);
  authSessions.delete(state);
  if (!session) return res.status(400).send("Invalid or expired X auth state");

  try {
    const tokenRes = await tokenRequest({
      code,
      grant_type: "authorization_code",
      client_id: X_CLIENT_ID,
      redirect_uri: X_REDIRECT_URI,
      code_verifier: session.codeVerifier
    });

    const accessToken = tokenRes.data.access_token;
    const refreshToken = tokenRes.data.refresh_token;

    const userRes = await axios.get(`${X_API}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { "user.fields": "username,name" }
    });
    const user = userRes.data.data;

    await db.read();
    const existing = db.data.accounts.find(
      (a) => a.platform === "x" && a.meta?.userId === user.id
    );
    const account = {
      id: existing?.id || nanoid(),
      platform: "x",
      name: user.username ? `@${user.username}` : user.name,
      accessToken,
      refreshToken: refreshToken || existing?.refreshToken,
      meta: { userId: user.id, username: user.username, displayName: user.name }
    };
    if (existing) Object.assign(existing, account);
    else db.data.accounts.push(account);
    await db.write();

    res.redirect(`${FRONTEND_URL}/?connected=x`);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("X OAuth failed. Check server logs.");
  }
});

async function refreshXAccessToken(account) {
  if (!account.refreshToken) throw new Error("Missing X refresh token. Reconnect the account.");

  const tokenRes = await tokenRequest({
    refresh_token: account.refreshToken,
    grant_type: "refresh_token",
    client_id: X_CLIENT_ID
  });

  account.accessToken = tokenRes.data.access_token;
  account.refreshToken = tokenRes.data.refresh_token || account.refreshToken;
  await db.write();
  return account.accessToken;
}

router.post("/post/x/:accountId", async (req, res) => {
  const { accountId } = req.params;
  const { text } = req.body;

  if (!text) return res.status(400).json({ error: "text is required" });

  await db.read();
  const account = db.data.accounts.find((a) => a.id === accountId);
  if (!account) return res.status(404).json({ error: "Account not found" });

  try {
    let token = account.accessToken;
    let result;
    try {
      result = await axios.post(
        `${X_API}/tweets`,
        { text },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      if (![401, 403].includes(err.response?.status)) throw err;
      token = await refreshXAccessToken(account);
      result = await axios.post(
        `${X_API}/tweets`,
        { text },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    }

    res.json({ success: true, result: result.data });
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

export default router;
