import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { MongoClient } from "mongodb";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = process.env.VERCEL
  ? path.join("/tmp", "unnatix-social-db.json")
  : path.join(__dirname, "data", "db.json");

const defaultData = {
  accounts: [],   // { id, platform, name, accessToken, refreshToken, expiresAt, meta }
  posts: [],       // { id, platform, accountId, content, mediaUrl, scheduledFor, status, result }
  pendingConnections: []
};

class MongoStateAdapter {
  constructor(uri, dbName) {
    this.client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000
    });
    this.dbName = dbName;
    this.collectionName = "app_state";
    this.documentId = "default";
    this.connected = false;
  }

  async connect() {
    if (this.connected) return;
    await this.client.connect();
    this.collection = this.client.db(this.dbName).collection(this.collectionName);
    this.connected = true;
  }

  async read() {
    await this.connect();
    const doc = await this.collection.findOne({ _id: this.documentId });
    return doc?.data || null;
  }

  async write(data) {
    await this.connect();
    await this.collection.updateOne(
      { _id: this.documentId },
      { $set: { data, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
  }
}

const mongoUri = process.env.MONGO_URL || process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB || process.env.DB_NAME || "unnatix_social";
const adapter = mongoUri ? new MongoStateAdapter(mongoUri, mongoDbName) : new JSONFile(file);
export const db = new Low(adapter, defaultData);

export async function initDb() {
  await db.read();
  db.data ||= defaultData;
  db.data.accounts ||= [];
  db.data.posts ||= [];
  db.data.pendingConnections ||= [];
  await db.write();
}
