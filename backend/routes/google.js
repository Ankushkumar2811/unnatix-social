import express from "express";
import axios from "axios";
import { google } from "googleapis";
import { nanoid } from "nanoid";
import { db } from "../db.js";

const router = express.Router();

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  FRONTEND_URL
} = process.env;

function getOAuthClient() {
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

// Scopes for both YouTube and Google Business Profile (GMB) in one consent screen
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/business.manage",
  "openid",
  "email",
  "profile"
];

router.get("/auth/google", (req, res) => {
  const oauth2Client = getOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline", // needed to get a refresh_token
    prompt: "consent",
    scope: SCOPES
  });
  res.redirect(url);
});

router.get("/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Missing code from Google");

  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    await db.read();

    // --- Save YouTube channel (if the account has one) ---
    try {
      const youtube = google.youtube({ version: "v3", auth: oauth2Client });
      const chRes = await youtube.channels.list({ part: "snippet", mine: true });
      const channel = chRes.data.items?.[0];
      if (channel) {
        const existing = db.data.accounts.find(
          (a) => a.platform === "youtube" && a.meta?.channelId === channel.id
        );
        const ytAccount = {
          id: existing?.id || nanoid(),
          platform: "youtube",
          name: channel.snippet.title,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || existing?.refreshToken,
          meta: { channelId: channel.id }
        };
        if (existing) Object.assign(existing, ytAccount);
        else db.data.accounts.push(ytAccount);
      }
    } catch (e) {
      console.log("No YouTube channel found or access denied:", e.message);
    }

    // --- Save Google My Business locations (if accessible) ---
    try {
      const accountsRes = await axios.get(
        "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      const gmbAccounts = accountsRes.data.accounts || [];

      for (const gmbAccount of gmbAccounts) {
        const locRes = await axios.get(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${gmbAccount.name}/locations`,
          {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
            params: { readMask: "name,title" }
          }
        );
        const locations = locRes.data.locations || [];
        for (const loc of locations) {
          const existing = db.data.accounts.find(
            (a) => a.platform === "gmb" && a.meta?.locationName === loc.name
          );
          const gmbEntry = {
            id: existing?.id || nanoid(),
            platform: "gmb",
            name: loc.title,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || existing?.refreshToken,
            meta: { locationName: loc.name, accountName: gmbAccount.name }
          };
          if (existing) Object.assign(existing, gmbEntry);
          else db.data.accounts.push(gmbEntry);
        }
      }
    } catch (e) {
      // Most accounts won't have GMB API access approved yet — that's expected until Google approves the app
      console.log(
        "GMB fetch skipped (likely needs Business Profile API access approval):",
        e.response?.data || e.message
      );
    }

    await db.write();
    res.redirect(`${FRONTEND_URL}/?connected=google`);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Google OAuth failed. Check server logs.");
  }
});

async function refreshAccessToken(account) {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: account.refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();
  account.accessToken = credentials.access_token;
  await db.write();
  return credentials.access_token;
}

// Upload a video to YouTube (videoUrl must be a direct, publicly-accessible video file URL)
router.post("/post/youtube/:accountId", async (req, res) => {
  const { accountId } = req.params;
  const { title, description, videoUrl } = req.body;

  if (!videoUrl) return res.status(400).json({ error: "videoUrl is required" });

  await db.read();
  const account = db.data.accounts.find((a) => a.id === accountId);
  if (!account) return res.status(404).json({ error: "Account not found" });

  try {
    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken
    });
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    const videoStream = await axios.get(videoUrl, { responseType: "stream" });

    const uploadRes = await youtube.videos.insert({
      part: "snippet,status",
      requestBody: {
        snippet: { title, description },
        status: { privacyStatus: "public" }
      },
      media: { body: videoStream.data }
    });

    res.json({ success: true, result: uploadRes.data });
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Create a Local Post on Google My Business (text + optional image URL)
router.post("/post/gmb/:accountId", async (req, res) => {
  const { accountId } = req.params;
  const { summary, imageUrl } = req.body;

  await db.read();
  const account = db.data.accounts.find((a) => a.id === accountId);
  if (!account) return res.status(404).json({ error: "Account not found" });

  try {
    const body = {
      languageCode: "en-US",
      summary,
      topicType: "STANDARD",
      ...(imageUrl && { media: [{ mediaFormat: "PHOTO", sourceUrl: imageUrl }] })
    };

    const result = await axios.post(
      `https://mybusiness.googleapis.com/v4/${account.meta.locationName}/localPosts`,
      body,
      { headers: { Authorization: `Bearer ${account.accessToken}` } }
    );

    res.json({ success: true, result: result.data });
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

export default router;
