import express from "express";
import { nanoid } from "nanoid";
import { db } from "../db.js";

const router = express.Router();

// List all connected accounts (across platforms)
router.get("/accounts", async (req, res) => {
  await db.read();
  // Never send raw access tokens to the frontend
  const safe = db.data.accounts.map(({ accessToken, ...rest }) => rest);
  res.json(safe);
});

// Disconnect / remove an account
router.delete("/accounts/:id", async (req, res) => {
  await db.read();
  db.data.accounts = db.data.accounts.filter((a) => a.id !== req.params.id);
  await db.write();
  res.json({ success: true });
});

// Create a scheduled post (actual publishing happens via the cron job in scheduler.js)
router.post("/schedule", async (req, res) => {
  const { platform, accountId, content, mediaUrl, scheduledFor } = req.body;
  if (!platform || !accountId || !scheduledFor) {
    return res.status(400).json({ error: "platform, accountId and scheduledFor are required" });
  }

  await db.read();
  const post = {
    id: nanoid(),
    platform,
    accountId,
    content: content || "",
    mediaUrl: mediaUrl || null,
    scheduledFor, // ISO datetime string
    status: "scheduled",
    result: null,
    createdAt: new Date().toISOString()
  };
  db.data.posts.push(post);
  await db.write();
  res.json({ success: true, post });
});

// List all scheduled / published posts
router.get("/schedule", async (req, res) => {
  await db.read();
  res.json(db.data.posts.sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor)));
});

// Cancel a scheduled post (only works if still in "scheduled" state)
router.delete("/schedule/:id", async (req, res) => {
  await db.read();
  const post = db.data.posts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: "Not found" });
  if (post.status !== "scheduled") {
    return res.status(400).json({ error: "Only scheduled posts can be cancelled" });
  }
  db.data.posts = db.data.posts.filter((p) => p.id !== req.params.id);
  await db.write();
  res.json({ success: true });
});

export default router;
