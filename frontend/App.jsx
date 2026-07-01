import React, { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "" : "http://localhost:4000");

const PLATFORM_META = {
  facebook: { label: "Facebook", color: "#1877F2" },
  instagram: { label: "Instagram", color: "#E1306C" },
  linkedin: { label: "LinkedIn", color: "#0A66C2" },
  x: { label: "X", color: "#FFFFFF" },
  youtube: { label: "YouTube", color: "#FF0000" },
  pinterest: { label: "Pinterest", color: "#E60023" },
  gmb: { label: "Google My Business", color: "#4285F4" }
};

export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [posts, setPosts] = useState([]);
  const [tab, setTab] = useState("compose");
  const [form, setForm] = useState({
    accountId: "",
    content: "",
    mediaUrl: "",
    scheduledFor: ""
  });
  const [status, setStatus] = useState("");

  const loadAccounts = useCallback(async () => {
    const res = await fetch(`${API}/accounts`);
    setAccounts(await res.json());
  }, []);

  const loadPosts = useCallback(async () => {
    const res = await fetch(`${API}/schedule`);
    setPosts(await res.json());
  }, []);

  useEffect(() => {
    loadAccounts();
    loadPosts();
    const interval = setInterval(loadPosts, 15000);
    return () => clearInterval(interval);
  }, [loadAccounts, loadPosts]);

  const selectedAccount = accounts.find((a) => a.id === form.accountId);

  async function handleSchedule(e) {
    e.preventDefault();
    if (!selectedAccount) {
      setStatus("Pehle ek account select karo.");
      return;
    }
    setStatus("Scheduling...");
    const res = await fetch(`${API}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: selectedAccount.platform,
        accountId: form.accountId,
        content: form.content,
        mediaUrl: form.mediaUrl || undefined,
        scheduledFor: new Date(form.scheduledFor).toISOString()
      })
    });
    if (res.ok) {
      setStatus("Post scheduled ✓");
      setForm({ accountId: "", content: "", mediaUrl: "", scheduledFor: "" });
      loadPosts();
    } else {
      const err = await res.json();
      setStatus(`Error: ${JSON.stringify(err.error || err)}`);
    }
  }

  async function cancelPost(id) {
    await fetch(`${API}/schedule/${id}`, { method: "DELETE" });
    loadPosts();
  }

  async function disconnectAccount(id) {
    if (!confirm("Disconnect this account?")) return;
    await fetch(`${API}/accounts/${id}`, { method: "DELETE" });
    loadAccounts();
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>UnnatiX Social</h1>
          <p style={styles.subtitle}>Ek jagah se sab connect, post, schedule.</p>
        </div>
        <nav style={styles.nav}>
          {["compose", "accounts", "schedule"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                ...styles.navBtn,
                ...(tab === t ? styles.navBtnActive : {})
              }}
            >
              {t === "compose" ? "Naya Post" : t === "accounts" ? "Accounts" : "Schedule"}
            </button>
          ))}
        </nav>
      </header>

      {tab === "accounts" && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Connect karo</h2>
          <div style={styles.connectRow}>
            <a href={`${API}/auth/meta`} style={styles.connectBtn}>
              + Facebook / Instagram
            </a>
            <a href={`${API}/auth/linkedin`} style={styles.connectBtn}>
              + LinkedIn
            </a>
            <a href={`${API}/auth/x`} style={styles.connectBtn}>
              + X
            </a>
            <a href={`${API}/auth/google`} style={styles.connectBtn}>
              + YouTube / Google My Business
            </a>
            <button style={{ ...styles.connectBtn, opacity: 0.5, cursor: "not-allowed" }} disabled>
              + Pinterest (jald aayega)
            </button>
          </div>

          <h2 style={styles.sectionTitle}>Connected Accounts</h2>
          {accounts.length === 0 && <p style={styles.empty}>Abhi koi account connect nahi hai.</p>}
          <div style={styles.accountGrid}>
            {accounts.map((a) => (
              <div key={a.id} style={styles.accountCard}>
                <div
                  style={{
                    ...styles.platformDot,
                    background: PLATFORM_META[a.platform]?.color || "#888"
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={styles.accountName}>{a.name}</div>
                  <div style={styles.accountPlatform}>
                    {PLATFORM_META[a.platform]?.label || a.platform}
                  </div>
                </div>
                <button style={styles.disconnectBtn} onClick={() => disconnectAccount(a.id)}>
                  Hatao
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "compose" && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Naya Post Banao</h2>
          <form onSubmit={handleSchedule} style={styles.form}>
            <label style={styles.label}>Account</label>
            <select
              style={styles.input}
              value={form.accountId}
              onChange={(e) => setForm({ ...form, accountId: e.target.value })}
              required
            >
              <option value="">-- select account --</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {PLATFORM_META[a.platform]?.label} — {a.name}
                </option>
              ))}
            </select>

            <label style={styles.label}>Caption / Text</label>
            <textarea
              style={{ ...styles.input, minHeight: 100 }}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Kya post karna hai..."
              required
            />

            <label style={styles.label}>Image URL (Instagram ke liye zaroori)</label>
            <input
              style={styles.input}
              value={form.mediaUrl}
              onChange={(e) => setForm({ ...form, mediaUrl: e.target.value })}
              placeholder="https://..."
            />

            <label style={styles.label}>Schedule Date & Time</label>
            <input
              type="datetime-local"
              style={styles.input}
              value={form.scheduledFor}
              onChange={(e) => setForm({ ...form, scheduledFor: e.target.value })}
              required
            />

            <button type="submit" style={styles.submitBtn}>
              Schedule Post
            </button>
            {status && <p style={styles.status}>{status}</p>}
          </form>
        </section>
      )}

      {tab === "schedule" && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Sab Posts</h2>
          {posts.length === 0 && <p style={styles.empty}>Koi post schedule nahi hua abhi.</p>}
          <div style={styles.postList}>
            {posts.map((p) => {
              const acc = accounts.find((a) => a.id === p.accountId);
              return (
                <div key={p.id} style={styles.postCard}>
                  <div
                    style={{
                      ...styles.platformDot,
                      background: PLATFORM_META[p.platform]?.color || "#888"
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={styles.postMeta}>
                      {PLATFORM_META[p.platform]?.label} · {acc?.name || "—"} ·{" "}
                      {new Date(p.scheduledFor).toLocaleString()}
                    </div>
                    <div style={styles.postContent}>{p.content}</div>
                    {p.status === "failed" && (
                      <div style={styles.postError}>
                        Failed: {JSON.stringify(p.result?.error || p.result)}
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      ...styles.statusBadge,
                      ...(p.status === "published"
                        ? styles.statusPublished
                        : p.status === "failed"
                        ? styles.statusFailed
                        : styles.statusScheduled)
                    }}
                  >
                    {p.status}
                  </span>
                  {p.status === "scheduled" && (
                    <button style={styles.disconnectBtn} onClick={() => cancelPost(p.id)}>
                      Cancel
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

const styles = {
  page: {
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    background: "#0F1115",
    color: "#EAEAEA",
    minHeight: "100vh",
    padding: "24px"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 32
  },
  title: { margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: -0.5 },
  subtitle: { margin: "4px 0 0", color: "#9A9DA6", fontSize: 14 },
  nav: { display: "flex", gap: 8 },
  navBtn: {
    background: "#1A1D23",
    border: "1px solid #2A2E37",
    color: "#C7C9D1",
    padding: "8px 16px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 14
  },
  navBtnActive: { background: "#2D6CDF", color: "#fff", borderColor: "#2D6CDF" },
  section: { maxWidth: 700 },
  sectionTitle: { fontSize: 16, fontWeight: 600, margin: "24px 0 12px", color: "#EAEAEA" },
  connectRow: { display: "flex", flexWrap: "wrap", gap: 10 },
  connectBtn: {
    background: "#1A1D23",
    border: "1px solid #2A2E37",
    color: "#EAEAEA",
    padding: "10px 16px",
    borderRadius: 8,
    textDecoration: "none",
    fontSize: 14,
    cursor: "pointer"
  },
  accountGrid: { display: "flex", flexDirection: "column", gap: 10 },
  accountCard: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "#1A1D23",
    border: "1px solid #2A2E37",
    borderRadius: 10,
    padding: "12px 16px"
  },
  platformDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  accountName: { fontWeight: 600, fontSize: 14 },
  accountPlatform: { fontSize: 12, color: "#9A9DA6" },
  disconnectBtn: {
    background: "transparent",
    border: "1px solid #3A3E47",
    color: "#C7C9D1",
    padding: "6px 12px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer"
  },
  empty: { color: "#7C7F88", fontSize: 14 },
  form: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12, color: "#9A9DA6", marginTop: 10 },
  input: {
    background: "#1A1D23",
    border: "1px solid #2A2E37",
    color: "#EAEAEA",
    padding: "10px 12px",
    borderRadius: 8,
    fontSize: 14,
    fontFamily: "inherit"
  },
  submitBtn: {
    marginTop: 18,
    background: "#2D6CDF",
    color: "#fff",
    border: "none",
    padding: "12px 20px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer"
  },
  status: { fontSize: 13, color: "#9A9DA6", marginTop: 8 },
  postList: { display: "flex", flexDirection: "column", gap: 10 },
  postCard: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    background: "#1A1D23",
    border: "1px solid #2A2E37",
    borderRadius: 10,
    padding: "12px 16px"
  },
  postMeta: { fontSize: 12, color: "#9A9DA6", marginBottom: 4 },
  postContent: { fontSize: 14, color: "#EAEAEA" },
  postError: { fontSize: 12, color: "#F87171", marginTop: 6 },
  statusBadge: {
    fontSize: 11,
    padding: "4px 10px",
    borderRadius: 100,
    fontWeight: 600,
    textTransform: "uppercase"
  },
  statusScheduled: { background: "#2A2E37", color: "#C7C9D1" },
  statusPublished: { background: "#16341F", color: "#4ADE80" },
  statusFailed: { background: "#3A1A1A", color: "#F87171" }
};
