import cron from "node-cron";
import axios from "axios";
import { db } from "./db.js";

const SELF_URL = `http://localhost:${process.env.PORT || 4000}`;

async function publishPost(post) {
  await db.read();
  const account = db.data.accounts.find((a) => a.id === post.accountId);
  if (!account) {
    post.status = "failed";
    post.result = { error: "Account not found (may have been disconnected)" };
    return;
  }

  try {
    let response;
    if (post.platform === "facebook") {
      response = await axios.post(`${SELF_URL}/post/facebook/${post.accountId}`, {
        message: post.content,
        imageUrl: post.mediaUrl
      });
    } else if (post.platform === "instagram") {
      response = await axios.post(`${SELF_URL}/post/instagram/${post.accountId}`, {
        caption: post.content,
        imageUrl: post.mediaUrl
      });
    } else if (post.platform === "linkedin") {
      response = await axios.post(`${SELF_URL}/post/linkedin/${post.accountId}`, {
        text: post.content
      });
    } else if (post.platform === "x") {
      response = await axios.post(`${SELF_URL}/post/x/${post.accountId}`, {
        text: post.content
      });
    } else if (post.platform === "youtube") {
      response = await axios.post(`${SELF_URL}/post/youtube/${post.accountId}`, {
        title: post.content?.slice(0, 100) || "Untitled",
        description: post.content,
        videoUrl: post.mediaUrl
      });
    } else if (post.platform === "gmb") {
      response = await axios.post(`${SELF_URL}/post/gmb/${post.accountId}`, {
        summary: post.content,
        imageUrl: post.mediaUrl
      });
    } else {
      throw new Error(`Publishing not yet implemented for platform: ${post.platform}`);
    }

    post.status = "published";
    post.result = response.data;
  } catch (err) {
    post.status = "failed";
    post.result = { error: err.response?.data || err.message };
  }
}

export function startScheduler() {
  // Runs every minute, checks for posts whose scheduled time has arrived
  cron.schedule("* * * * *", async () => {
    await db.read();
    const now = new Date();
    const due = db.data.posts.filter(
      (p) => p.status === "scheduled" && new Date(p.scheduledFor) <= now
    );

    for (const post of due) {
      await publishPost(post);
    }

    if (due.length > 0) {
      await db.write();
      console.log(`[scheduler] Published ${due.length} post(s) at ${now.toISOString()}`);
    }
  });

  console.log("[scheduler] Cron job started — checking for due posts every minute");
}
