import express from "express";
import axios from "axios";
import { nanoid } from "nanoid";
import { db } from "../db.js";

const router = express.Router();

const {
  LINKEDIN_CLIENT_ID,
  LINKEDIN_CLIENT_SECRET,
  LINKEDIN_REDIRECT_URI,
  FRONTEND_URL
} = process.env;

router.get("/auth/linkedin", (req, res) => {
  const scopes = ["openid", "profile", "w_member_social", "r_organization_social", "w_organization_social"].join(" ");
  const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(
    LINKEDIN_REDIRECT_URI
  )}&scope=${encodeURIComponent(scopes)}`;
  res.redirect(url);
});

router.get("/auth/linkedin/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Missing code from LinkedIn");

  try {
    const tokenRes = await axios.post(
      "https://www.linkedin.com/oauth/v2/accessToken",
      null,
      {
        params: {
          grant_type: "authorization_code",
          code,
          redirect_uri: LINKEDIN_REDIRECT_URI,
          client_id: LINKEDIN_CLIENT_ID,
          client_secret: LINKEDIN_CLIENT_SECRET
        }
      }
    );
    const accessToken = tokenRes.data.access_token;

    const profileRes = await axios.get("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    await db.read();
    const existing = db.data.accounts.find(
      (a) => a.platform === "linkedin" && a.meta?.sub === profileRes.data.sub
    );
    const account = {
      id: existing?.id || nanoid(),
      platform: "linkedin",
      name: profileRes.data.name,
      accessToken,
      meta: { sub: profileRes.data.sub }
    };
    if (existing) Object.assign(existing, account);
    else db.data.accounts.push(account);
    await db.write();

    res.redirect(`${FRONTEND_URL}/?connected=linkedin`);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("LinkedIn OAuth failed. Check server logs.");
  }
});

// Post a text update to LinkedIn (as the person)
router.post("/post/linkedin/:accountId", async (req, res) => {
  const { accountId } = req.params;
  const { text } = req.body;

  await db.read();
  const account = db.data.accounts.find((a) => a.id === accountId);
  if (!account) return res.status(404).json({ error: "Account not found" });

  try {
    const result = await axios.post(
      "https://api.linkedin.com/v2/ugcPosts",
      {
        author: `urn:li:person:${account.meta.sub}`,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text },
            shareMediaCategory: "NONE"
          }
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" }
      },
      {
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          "X-Restli-Protocol-Version": "2.0.0"
        }
      }
    );
    res.json({ success: true, result: result.data });
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

export default router;
