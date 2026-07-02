import React, { useCallback, useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "" : "http://localhost:4000");

const PLATFORM_META = {
  facebook: { label: "Facebook", short: "f", color: "#1877F2", bg: "#EAF2FF" },
  instagram: { label: "Instagram", short: "ig", color: "#E1306C", bg: "#FDECF4" },
  linkedin: { label: "LinkedIn", short: "in", color: "#0A66C2", bg: "#EAF4FB" },
  x: { label: "X", short: "x", color: "#111111", bg: "#EEEEEE" },
  youtube: { label: "YouTube", short: "yt", color: "#FF0000", bg: "#FFF0F0" },
  pinterest: { label: "Pinterest", short: "p", color: "#E60023", bg: "#FFF0F2" },
  gmb: { label: "Google Business", short: "g", color: "#4285F4", bg: "#EEF5FF" }
};

const CONNECT_CHANNELS = [
  { platform: "facebook", label: "Facebook Pages", href: "/auth/meta?intent=facebook" },
  { platform: "instagram", label: "Instagram Business", href: "/auth/meta?intent=instagram" },
  { platform: "linkedin", label: "LinkedIn", href: "/auth/linkedin" },
  { platform: "x", label: "X", href: "/auth/x" },
  { platform: "youtube", label: "YouTube / Google Business", href: "/auth/google" }
];

const STATUS_TABS = [
  { key: "scheduled", label: "Queue" },
  { key: "draft", label: "Drafts" },
  { key: "approval", label: "Approvals" },
  { key: "published", label: "Sent" }
];

const IDEAS = [
  {
    group: "Unassigned",
    items: [
      {
        title: "Turn customer wins into social proof",
        body: "Pick one client result and frame it as a short LinkedIn post with a clear before/after."
      },
      {
        title: "Show the process",
        body: "Record a small behind-the-scenes clip and schedule it for Instagram or YouTube."
      }
    ]
  },
  { group: "To Do", items: [] },
  { group: "In Progress", items: [] },
  { group: "Done", items: [] }
];

function getPlatformMeta(platform) {
  return PLATFORM_META[platform] || { label: platform || "Channel", short: "?", color: "#555", bg: "#EEE" };
}

function formatDateTime(value) {
  if (!value) return "No time";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function getDefaultScheduleTime() {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 30);
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
}

export default function App() {
  if (window.location.pathname === "/privacy-policy") {
    return <PrivacyPolicyPage />;
  }
  if (window.location.pathname === "/terms") {
    return <TermsPage />;
  }
  if (window.location.pathname === "/data-deletion") {
    return <DataDeletionPage />;
  }

  const [accounts, setAccounts] = useState([]);
  const [posts, setPosts] = useState([]);
  const [activeView, setActiveView] = useState("publish");
  const [publishTab, setPublishTab] = useState("scheduled");
  const [layout, setLayout] = useState("list");
  const [composerOpen, setComposerOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [metaSelection, setMetaSelection] = useState(null);
  const [selectedMetaIds, setSelectedMetaIds] = useState([]);
  const [form, setForm] = useState({
    accountId: "",
    content: "",
    mediaUrl: "",
    scheduledFor: getDefaultScheduleTime()
  });

  const loadAccounts = useCallback(async () => {
    const res = await fetch(`${API}/accounts`);
    if (!res.ok) throw new Error("Could not load accounts");
    setAccounts(await res.json());
  }, []);

  const loadPosts = useCallback(async () => {
    const res = await fetch(`${API}/schedule`);
    if (!res.ok) throw new Error("Could not load scheduled posts");
    setPosts(await res.json());
  }, []);

  useEffect(() => {
    loadAccounts().catch(() => setStatus("Could not load connected accounts."));
    loadPosts().catch(() => setStatus("Could not load posts."));
    const interval = setInterval(() => {
      loadPosts().catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [loadAccounts, loadPosts]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pendingId = params.get("selectMeta");
    if (!pendingId) return;

    fetch(`${API}/auth/meta/pending/${pendingId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Could not load Meta channels");
        return res.json();
      })
      .then((data) => {
        setMetaSelection(data);
        setSelectedMetaIds([]);
        window.history.replaceState({}, "", window.location.pathname);
      })
      .catch(() => setStatus("Could not load Meta channel selection."));
  }, []);

  const counts = useMemo(() => {
    return posts.reduce(
      (acc, post) => {
        const key = post.status === "scheduled" ? "scheduled" : post.status === "published" ? "published" : "failed";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      { scheduled: 0, draft: 0, approval: 0, published: 0, failed: 0 }
    );
  }, [posts]);

  const selectedAccount = accounts.find((account) => account.id === form.accountId);
  const visiblePosts = posts.filter((post) => {
    if (publishTab === "draft" || publishTab === "approval") return false;
    if (publishTab === "published") return post.status === "published";
    return post.status === "scheduled" || post.status === "failed";
  });

  function openComposer(accountId = "") {
    setForm({
      accountId,
      content: "",
      mediaUrl: "",
      scheduledFor: getDefaultScheduleTime()
    });
    setStatus("");
    setComposerOpen(true);
  }

  async function handleSchedule(event) {
    event.preventDefault();
    if (!selectedAccount) {
      setStatus("Select a channel first.");
      return;
    }

    setStatus("Scheduling post...");
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

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setStatus(`Error: ${JSON.stringify(err.error || err)}`);
      return;
    }

    setStatus("Post scheduled.");
    setComposerOpen(false);
    await loadPosts();
  }

  async function cancelPost(id) {
    await fetch(`${API}/schedule/${id}`, { method: "DELETE" });
    await loadPosts();
  }

  async function disconnectAccount(id) {
    if (!confirm("Disconnect this channel?")) return;
    await fetch(`${API}/accounts/${id}`, { method: "DELETE" });
    await loadAccounts();
  }

  function toggleMetaCandidate(candidateId) {
    setSelectedMetaIds((current) =>
      current.includes(candidateId) ? current.filter((id) => id !== candidateId) : [...current, candidateId]
    );
  }

  async function confirmMetaSelection() {
    if (!metaSelection) return;
    setStatus("Connecting selected channels...");
    const res = await fetch(`${API}/auth/meta/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pendingId: metaSelection.id,
        candidateIds: selectedMetaIds
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setStatus(`Could not connect channels: ${JSON.stringify(err.error || err)}`);
      return;
    }
    setMetaSelection(null);
    setSelectedMetaIds([]);
    setStatus("Selected channels connected.");
    await loadAccounts();
  }

  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.logoRow}>
          <div style={styles.logoMark}>UX</div>
          <strong style={styles.logoText}>UnnatiX</strong>
        </div>

        <button style={styles.newButton} onClick={() => openComposer()}>
          <span style={styles.plus}>+</span> New
        </button>

        <nav style={styles.mainNav}>
          {[
            { key: "home", label: "Home", count: null },
            { key: "create", label: "Create", count: null },
            { key: "publish", label: "Publish", count: counts.scheduled },
            { key: "community", label: "Community", count: null }
          ].map((item) => (
            <button
              key={item.key}
              style={{ ...styles.navItem, ...(activeView === item.key ? styles.navItemActive : {}) }}
              onClick={() => setActiveView(item.key)}
            >
              <span>{item.label}</span>
              {item.count !== null && <span style={styles.navCount}>{item.count}</span>}
            </button>
          ))}
        </nav>

        <div style={styles.sidebarSection}>
          <div style={styles.sectionLabel}>Channels</div>
          {accounts.length === 0 && <div style={styles.mutedSmall}>No channels connected yet.</div>}
          {accounts.map((account) => {
            const meta = getPlatformMeta(account.platform);
            return (
              <button key={account.id} style={styles.channelRow} onClick={() => openComposer(account.id)}>
                <span style={{ ...styles.channelIcon, background: meta.color }}>{meta.short}</span>
                <span style={styles.channelName}>{account.name}</span>
                <span style={styles.channelCount}>0</span>
              </button>
            );
          })}
        </div>

        <div style={styles.sidebarSection}>
          <div style={styles.sectionLabel}>Connect channels</div>
          {CONNECT_CHANNELS.map((channel) => {
            const meta = getPlatformMeta(channel.platform);
            return (
              <a key={channel.label} href={`${API}${channel.href}`} style={styles.connectLink}>
                <span style={{ ...styles.connectIcon, color: meta.color }}>+</span>
                {channel.label}
              </a>
            );
          })}
        </div>

        <div style={styles.orgCard}>
          <div style={styles.avatar}>U</div>
          <div>
            <strong>My Organization</strong>
            <span>Free Plan</span>
          </div>
        </div>
      </aside>

      <main style={styles.main}>
        {activeView === "create" && <CreateView onNewPost={() => openComposer()} />}
        {activeView === "publish" && (
          <PublishView
            accounts={accounts}
            counts={counts}
            layout={layout}
            posts={visiblePosts}
            publishTab={publishTab}
            setLayout={setLayout}
            setPublishTab={setPublishTab}
            onCancel={cancelPost}
            onDisconnect={disconnectAccount}
            onNewPost={() => openComposer()}
          />
        )}
        {activeView === "home" && (
          <HomeView accounts={accounts} posts={posts} onConnect={() => setActiveView("publish")} onNewPost={() => openComposer()} />
        )}
        {activeView === "community" && <CommunityView />}
      </main>

      <button style={styles.helpButton}>?</button>

      {composerOpen && (
        <ComposerModal
          accounts={accounts}
          form={form}
          setForm={setForm}
          status={status}
          onClose={() => setComposerOpen(false)}
          onSubmit={handleSchedule}
        />
      )}

      {metaSelection && (
        <MetaSelectionModal
          selection={metaSelection}
          selectedIds={selectedMetaIds}
          onToggle={toggleMetaCandidate}
          onClose={() => setMetaSelection(null)}
          onConfirm={confirmMetaSelection}
          status={status}
        />
      )}
    </div>
  );
}

function PublishView({
  accounts,
  counts,
  layout,
  posts,
  publishTab,
  setLayout,
  setPublishTab,
  onCancel,
  onDisconnect,
  onNewPost
}) {
  return (
    <section style={styles.panel}>
      <Header
        title={accounts.length ? "All Channels" : "UnnatiX Technologies"}
        subtitle={accounts.length ? `${accounts.length} connected channel${accounts.length > 1 ? "s" : ""}` : "Connect a channel to start scheduling"}
        action={onNewPost}
      />

      <div style={styles.toolbar}>
        <TabRow counts={counts} active={publishTab} onChange={setPublishTab} />
        <div style={styles.toolbarActions}>
          <button style={styles.filterButton}>Tags</button>
          <button style={styles.filterButton}>Kolkata</button>
          <div style={styles.segment}>
            <button style={{ ...styles.segmentButton, ...(layout === "list" ? styles.segmentActive : {}) }} onClick={() => setLayout("list")}>
              List
            </button>
            <button style={{ ...styles.segmentButton, ...(layout === "calendar" ? styles.segmentActive : {}) }} onClick={() => setLayout("calendar")}>
              Calendar
            </button>
          </div>
        </div>
      </div>

      {posts.length === 0 ? (
        <EmptyPublishState onNewPost={onNewPost} />
      ) : layout === "calendar" ? (
        <CalendarGrid posts={posts} />
      ) : (
        <PostList accounts={accounts} posts={posts} onCancel={onCancel} />
      )}

      {accounts.length > 0 && (
        <div style={styles.connectedBlock}>
          <div style={styles.blockTitle}>Connected channels</div>
          <div style={styles.accountGrid}>
            {accounts.map((account) => {
              const meta = getPlatformMeta(account.platform);
              return (
                <div key={account.id} style={styles.accountCard}>
                  <span style={{ ...styles.channelIcon, background: meta.color }}>{meta.short}</span>
                  <div style={{ flex: 1 }}>
                    <strong>{account.name}</strong>
                    <span>{meta.label}</span>
                  </div>
                  <button style={styles.secondarySmall} onClick={() => onDisconnect(account.id)}>
                    Disconnect
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function Header({ title, subtitle, action }) {
  return (
    <div style={styles.header}>
      <div style={styles.workspaceTitle}>
        <div style={styles.workspaceAvatar}>UX</div>
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
      <button style={styles.outlineButton} onClick={action}>
        + New Post
      </button>
    </div>
  );
}

function TabRow({ counts, active, onChange }) {
  return (
    <div style={styles.tabs}>
      {STATUS_TABS.map((tab) => (
        <button
          key={tab.key}
          style={{ ...styles.tab, ...(active === tab.key ? styles.tabActive : {}) }}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
          <span style={styles.pill}>{counts[tab.key] || 0}</span>
        </button>
      ))}
    </div>
  );
}

function EmptyPublishState({ onNewPost }) {
  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyArt}>
        <div />
        <div />
        <div />
      </div>
      <h2>No posts scheduled</h2>
      <p>Schedule some posts and they will appear here.</p>
      <button style={styles.primarySmall} onClick={onNewPost}>
        + New Post
      </button>
    </div>
  );
}

function PostList({ accounts, posts, onCancel }) {
  return (
    <div style={styles.timeline}>
      <div style={styles.todayLabel}>Today</div>
      {posts.map((post) => {
        const account = accounts.find((item) => item.id === post.accountId);
        const meta = getPlatformMeta(post.platform);
        return (
          <article key={post.id} style={styles.postRow}>
            <div style={styles.timeCol}>{formatDateTime(post.scheduledFor)}</div>
            <div style={styles.postCard}>
              <span style={{ ...styles.channelIcon, background: meta.color }}>{meta.short}</span>
              <div style={{ flex: 1 }}>
                <div style={styles.postMeta}>
                  {meta.label} · {account?.name || "Disconnected channel"}
                </div>
                <div style={styles.postText}>{post.content}</div>
                {post.mediaUrl && <div style={styles.mediaUrl}>{post.mediaUrl}</div>}
                {post.status === "failed" && <div style={styles.errorText}>Failed: {JSON.stringify(post.result?.error || post.result)}</div>}
              </div>
              <span style={{ ...styles.statusBadge, ...(post.status === "failed" ? styles.failedBadge : styles.queueBadge) }}>{post.status}</span>
              {post.status === "scheduled" && (
                <button style={styles.secondarySmall} onClick={() => onCancel(post.id)}>
                  Cancel
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function CalendarGrid({ posts }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div style={styles.calendarGrid}>
      {days.map((day, index) => (
        <div key={day} style={styles.calendarDay}>
          <div style={styles.calendarHead}>{day}</div>
          {posts
            .filter((_, postIndex) => postIndex % 7 === index)
            .map((post) => {
              const meta = getPlatformMeta(post.platform);
              return (
                <div key={post.id} style={styles.calendarPost}>
                  <span style={{ ...styles.dot, background: meta.color }} />
                  {post.content.slice(0, 45) || "Scheduled post"}
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}

function CreateView({ onNewPost }) {
  return (
    <section style={styles.panel}>
      <div style={styles.simpleHeader}>
        <h1>Create</h1>
        <button style={styles.outlineButton} onClick={onNewPost}>
          + New Idea
        </button>
      </div>
      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...styles.tabActive }}>Ideas</button>
        <button style={styles.tab}>Templates</button>
        <button style={styles.tab}>Feeds</button>
      </div>
      <div style={styles.createToolbar}>
        <button style={styles.generateButton}>Generate Ideas</button>
        <div style={styles.segment}>
          <button style={{ ...styles.segmentButton, ...styles.segmentActive }}>Board</button>
          <button style={styles.segmentButton}>Gallery</button>
        </div>
      </div>
      <div style={styles.ideaBoard}>
        {IDEAS.map((column) => (
          <div key={column.group} style={styles.ideaColumn}>
            <div style={styles.columnHeader}>
              <strong>{column.group}</strong>
              <span style={styles.pill}>{column.items.length}</span>
            </div>
            {column.items.map((item) => (
              <div key={item.title} style={styles.ideaCard}>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </div>
            ))}
            <button style={styles.addIdeaButton}>+ New Idea</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function HomeView({ accounts, posts, onNewPost }) {
  return (
    <section style={styles.panel}>
      <div style={styles.simpleHeader}>
        <div>
          <h1>Home</h1>
          <p style={styles.headerSub}>Your social media command center.</p>
        </div>
        <button style={styles.outlineButton} onClick={onNewPost}>
          + New Post
        </button>
      </div>
      <div style={styles.statsGrid}>
        <StatCard label="Connected channels" value={accounts.length} />
        <StatCard label="Queued posts" value={posts.filter((post) => post.status === "scheduled").length} />
        <StatCard label="Sent posts" value={posts.filter((post) => post.status === "published").length} />
        <StatCard label="Failed posts" value={posts.filter((post) => post.status === "failed").length} />
      </div>
    </section>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={styles.statCard}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CommunityView() {
  return (
    <section style={styles.panel}>
      <div style={styles.simpleHeader}>
        <h1>Community</h1>
      </div>
      <div style={styles.emptyState}>
        <h2>Inbox and engagement coming next</h2>
        <p>Comments, mentions, and replies will live here once platform webhooks are added.</p>
      </div>
    </section>
  );
}

function ComposerModal({ accounts, form, setForm, status, onClose, onSubmit }) {
  return (
    <div style={styles.modalBackdrop}>
      <form style={styles.composer} onSubmit={onSubmit}>
        <div style={styles.composerHeader}>
          <div>
            <h2>Create post</h2>
            <p>Schedule content to any connected channel.</p>
          </div>
          <button type="button" style={styles.closeButton} onClick={onClose}>
            x
          </button>
        </div>

        <label style={styles.label}>Channel</label>
        <select style={styles.input} value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} required>
          <option value="">Select channel</option>
          {accounts.map((account) => {
            const meta = getPlatformMeta(account.platform);
            return (
              <option key={account.id} value={account.id}>
                {meta.label} - {account.name}
              </option>
            );
          })}
        </select>

        <label style={styles.label}>Caption / text</label>
        <textarea
          style={{ ...styles.input, minHeight: 150, resize: "vertical" }}
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          placeholder="What do you want to share?"
          required
        />

        <label style={styles.label}>Media URL</label>
        <input
          style={styles.input}
          value={form.mediaUrl}
          onChange={(e) => setForm({ ...form, mediaUrl: e.target.value })}
          placeholder="https://..."
        />

        <label style={styles.label}>Schedule date and time</label>
        <input
          type="datetime-local"
          style={styles.input}
          value={form.scheduledFor}
          onChange={(e) => setForm({ ...form, scheduledFor: e.target.value })}
          required
        />

        <div style={styles.composerFooter}>
          {status && <span style={styles.statusText}>{status}</span>}
          <button type="button" style={styles.secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" style={styles.primaryButton}>
            Schedule Post
          </button>
        </div>
      </form>
    </div>
  );
}

function MetaSelectionModal({ selection, selectedIds, onToggle, onClose, onConfirm, status }) {
  const count = selection.candidates.length;
  return (
    <div style={styles.modalBackdrop}>
      <div style={styles.composer}>
        <div style={styles.composerHeader}>
          <div>
            <h2>Select channels to connect</h2>
            <p>
              We found {count} {count === 1 ? "channel" : "channels"}. Choose only the channels you want to add now.
            </p>
          </div>
          <button type="button" style={styles.closeButton} onClick={onClose}>
            x
          </button>
        </div>

        {selection.candidates.length === 0 ? (
          <div style={styles.selectionEmpty}>
            No eligible {selection.intent === "instagram" ? "Instagram Business" : "Facebook Page"} channels were found.
          </div>
        ) : (
          <div style={styles.selectionList}>
            {selection.candidates.map((candidate) => {
              const meta = getPlatformMeta(candidate.platform);
              const checked = selectedIds.includes(candidate.candidateId);
              return (
                <label key={candidate.candidateId} style={{ ...styles.selectionItem, ...(checked ? styles.selectionItemActive : {}) }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(candidate.candidateId)}
                  />
                  <span style={{ ...styles.channelIcon, background: meta.color }}>{meta.short}</span>
                  <span style={{ flex: 1 }}>
                    <strong>{candidate.name}</strong>
                    <small>
                      {meta.label}
                      {candidate.meta?.pageName ? ` linked to ${candidate.meta.pageName}` : ""}
                    </small>
                  </span>
                </label>
              );
            })}
          </div>
        )}

        <div style={styles.composerFooter}>
          {status && <span style={styles.statusText}>{status}</span>}
          <button type="button" style={styles.secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            style={{ ...styles.primaryButton, opacity: selectedIds.length ? 1 : 0.55 }}
            disabled={!selectedIds.length}
            onClick={onConfirm}
          >
            Connect Selected
          </button>
        </div>
      </div>
    </div>
  );
}

function PrivacyPolicyPage() {
  return (
    <main style={styles.policyPage}>
      <section style={styles.policyCard}>
        <div style={styles.policyHeader}>
          <div style={styles.logoMark}>UX</div>
          <div>
            <p style={styles.policyEyebrow}>UnnatiX Social</p>
            <h1>Privacy Policy</h1>
          </div>
        </div>

        <p style={styles.policyIntro}>
          This Privacy Policy explains how UnnatiX Social collects, uses, and protects information when you use our
          social media management platform.
        </p>

        <PolicySection title="Information We Collect">
          We may collect account information you provide, connected social channel details, scheduled post content,
          media URLs, OAuth authorization data, usage activity, and technical information such as device, browser, and
          log data needed to operate the service.
        </PolicySection>

        <PolicySection title="How We Use Information">
          We use information to connect your social accounts, schedule and publish posts, display your dashboard,
          maintain service security, troubleshoot issues, improve product reliability, and communicate important
          service updates.
        </PolicySection>

        <PolicySection title="Cookies">
          We may use cookies or similar technologies to keep users signed in, remember preferences, protect sessions,
          and understand basic product usage. You can control cookies through your browser settings.
        </PolicySection>

        <PolicySection title="Third Party Services">
          UnnatiX Social integrates with third party platforms including Meta, Facebook, Instagram, Google, YouTube,
          Google Business Profile, LinkedIn, and X. Your use of those platforms is also governed by their own terms,
          privacy policies, and developer platform rules.
        </PolicySection>

        <PolicySection title="Data Security">
          We use reasonable technical and organizational safeguards to protect user information. OAuth tokens and
          sensitive credentials are intended to be stored on backend systems only. No method of transmission or storage
          is completely secure, but we work to reduce risk and restrict unnecessary access.
        </PolicySection>

        <PolicySection title="Contact Information">
          If you have questions about this Privacy Policy or want to request data deletion, contact us at{" "}
          <a href="mailto:unnatixtechnologies@gmail.com" style={styles.policyLink}>
            unnatixtechnologies@gmail.com
          </a>
          .
        </PolicySection>

        <PolicySection title="Effective Date">This Privacy Policy is effective as of July 2, 2026.</PolicySection>
      </section>
    </main>
  );
}

function TermsPage() {
  return (
    <main style={styles.policyPage}>
      <section style={styles.policyCard}>
        <div style={styles.policyHeader}>
          <div style={styles.logoMark}>UX</div>
          <div>
            <p style={styles.policyEyebrow}>UnnatiX Social</p>
            <h1>Terms of Service</h1>
          </div>
        </div>

        <p style={styles.policyIntro}>
          These Terms of Service describe the rules for using UnnatiX Social, a social media management and scheduling
          platform.
        </p>

        <PolicySection title="Use of the Service">
          You may use UnnatiX Social to connect supported social channels, create content, schedule posts, and manage
          publishing workflows. You are responsible for keeping your account access secure and for all activity that
          occurs through your connected channels.
        </PolicySection>

        <PolicySection title="Connected Social Platforms">
          Your use of Facebook, Instagram, Google, YouTube, Google Business Profile, LinkedIn, X, and other integrated
          services remains subject to each platform's own terms, policies, permissions, rate limits, and review
          requirements.
        </PolicySection>

        <PolicySection title="User Content">
          You retain ownership of the content you create or schedule. By using the service, you authorize UnnatiX Social
          to process, store, and submit that content to the social platforms you select.
        </PolicySection>

        <PolicySection title="Prohibited Use">
          You must not use the service for illegal activity, spam, platform manipulation, infringement, harmful content,
          unauthorized access, or anything that violates third party platform rules.
        </PolicySection>

        <PolicySection title="Service Availability">
          We aim to provide a reliable service, but publishing may depend on third party APIs, token validity, platform
          permissions, outages, rate limits, and account status.
        </PolicySection>

        <PolicySection title="Contact Information">
          For questions about these Terms, contact{" "}
          <a href="mailto:unnatixtechnologies@gmail.com" style={styles.policyLink}>
            unnatixtechnologies@gmail.com
          </a>
          .
        </PolicySection>

        <PolicySection title="Effective Date">These Terms are effective as of July 2, 2026.</PolicySection>
      </section>
    </main>
  );
}

function DataDeletionPage() {
  return (
    <main style={styles.policyPage}>
      <section style={styles.policyCard}>
        <div style={styles.policyHeader}>
          <div style={styles.logoMark}>UX</div>
          <div>
            <p style={styles.policyEyebrow}>UnnatiX Social</p>
            <h1>Data Deletion Instructions</h1>
          </div>
        </div>

        <p style={styles.policyIntro}>
          You can request deletion of data associated with your UnnatiX Social account or connected social channels by
          following the instructions below.
        </p>

        <PolicySection title="How to Request Deletion">
          Email us at{" "}
          <a href="mailto:unnatixtechnologies@gmail.com" style={styles.policyLink}>
            unnatixtechnologies@gmail.com
          </a>{" "}
          with the subject line "Data Deletion Request". Include the email address or social account name connected to
          UnnatiX Social so we can locate the relevant records.
        </PolicySection>

        <PolicySection title="What We Delete">
          Upon verification, we will delete or anonymize connected channel records, scheduled post records, OAuth tokens,
          stored media references, and related account data that is no longer required to provide the service.
        </PolicySection>

        <PolicySection title="Third Party Platform Data">
          Deleting data from UnnatiX Social does not automatically delete content already published to Facebook,
          Instagram, Google, YouTube, Google Business Profile, LinkedIn, X, or other third party platforms. You may need
          to delete that content directly on those platforms.
        </PolicySection>

        <PolicySection title="Processing Time">
          We aim to respond to deletion requests within a reasonable timeframe after verifying ownership of the relevant
          account or connected channel.
        </PolicySection>

        <PolicySection title="Effective Date">These data deletion instructions are effective as of July 2, 2026.</PolicySection>
      </section>
    </main>
  );
}

function PolicySection({ title, children }) {
  return (
    <section style={styles.policySection}>
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}

const styles = {
  shell: {
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: "240px minmax(0, 1fr)",
    background: "#F7F6F3",
    color: "#151515",
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
  },
  sidebar: {
    minHeight: "100vh",
    background: "#F1F0EC",
    borderRight: "1px solid #DCD9D2",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 18,
    position: "sticky",
    top: 0
  },
  logoRow: { display: "flex", alignItems: "center", gap: 10, padding: "6px 8px" },
  logoMark: {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: "grid",
    placeItems: "center",
    background: "#151515",
    color: "#B4F5A1",
    fontWeight: 800,
    fontSize: 12
  },
  logoText: { fontSize: 20 },
  newButton: {
    border: "none",
    borderRadius: 24,
    padding: "12px 18px",
    background: "#A9EE96",
    color: "#111",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 15
  },
  plus: { fontSize: 18, marginRight: 8 },
  mainNav: { display: "flex", flexDirection: "column", gap: 4 },
  navItem: {
    border: "none",
    borderRadius: 8,
    background: "transparent",
    padding: "10px 12px",
    display: "flex",
    justifyContent: "space-between",
    cursor: "pointer",
    fontSize: 14,
    color: "#2D2D2D"
  },
  navItemActive: { background: "#E4E1DC", fontWeight: 700 },
  navCount: { color: "#59615B" },
  sidebarSection: { display: "flex", flexDirection: "column", gap: 8 },
  sectionLabel: { fontSize: 12, color: "#696A65", margin: "2px 0 4px" },
  mutedSmall: { fontSize: 13, color: "#696A65", lineHeight: 1.45 },
  channelRow: {
    border: "none",
    background: "transparent",
    display: "grid",
    gridTemplateColumns: "24px 1fr auto",
    alignItems: "center",
    gap: 8,
    padding: "5px 6px",
    borderRadius: 8,
    cursor: "pointer",
    textAlign: "left"
  },
  channelIcon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    color: "#FFF",
    display: "inline-grid",
    placeItems: "center",
    fontSize: 10,
    fontWeight: 800,
    textTransform: "uppercase",
    flexShrink: 0
  },
  channelName: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  channelCount: { color: "#656761", fontSize: 12 },
  connectLink: {
    color: "#333",
    textDecoration: "none",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "5px 6px",
    borderRadius: 8,
    fontSize: 14
  },
  connectIcon: {
    width: 22,
    height: 22,
    borderRadius: 7,
    display: "grid",
    placeItems: "center",
    background: "#FFF",
    fontWeight: 800
  },
  orgCard: {
    marginTop: "auto",
    borderTop: "1px solid #DCD9D2",
    paddingTop: 14,
    display: "flex",
    gap: 10,
    alignItems: "center",
    fontSize: 13
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: "#C8D1FF",
    color: "#18236F",
    display: "grid",
    placeItems: "center",
    fontWeight: 800
  },
  main: { padding: 8, minWidth: 0 },
  panel: {
    minHeight: "calc(100vh - 18px)",
    background: "#FFF",
    border: "1px solid #DEDBD5",
    borderRadius: 10,
    padding: "26px 32px",
    boxSizing: "border-box",
    overflow: "hidden"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 24
  },
  workspaceTitle: { display: "flex", gap: 14, alignItems: "center" },
  workspaceAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: "#151515",
    color: "#B4F5A1",
    display: "grid",
    placeItems: "center",
    fontWeight: 800
  },
  outlineButton: {
    background: "#FFF",
    border: "1px solid #D6D2CA",
    borderRadius: 8,
    padding: "9px 14px",
    cursor: "pointer",
    fontWeight: 600
  },
  toolbar: {
    borderBottom: "1px solid #DFDCD5",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap"
  },
  tabs: { display: "flex", gap: 20, alignItems: "center" },
  tab: {
    border: "none",
    background: "transparent",
    padding: "12px 0",
    cursor: "pointer",
    fontWeight: 600,
    color: "#4B4D48",
    borderBottom: "1px solid transparent"
  },
  tabActive: { color: "#111", borderBottomColor: "#1C7A42" },
  pill: {
    marginLeft: 6,
    background: "#ECEBE7",
    borderRadius: 100,
    padding: "2px 7px",
    color: "#555",
    fontSize: 12
  },
  toolbarActions: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  filterButton: {
    border: "none",
    background: "transparent",
    color: "#333",
    cursor: "pointer",
    fontWeight: 600
  },
  segment: {
    display: "flex",
    border: "1px solid #D6D2CA",
    borderRadius: 8,
    padding: 3,
    gap: 2
  },
  segmentButton: {
    border: "none",
    background: "transparent",
    padding: "5px 10px",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 600
  },
  segmentActive: { background: "#DDF4D8", color: "#1B7A3D" },
  emptyState: {
    minHeight: 360,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    color: "#333"
  },
  emptyArt: { display: "grid", gap: 8, width: 240, marginBottom: 24 },
  primarySmall: {
    border: "none",
    borderRadius: 8,
    background: "#A9EE96",
    padding: "12px 20px",
    cursor: "pointer",
    fontWeight: 700
  },
  timeline: { paddingTop: 26 },
  todayLabel: { marginLeft: 118, fontWeight: 800, marginBottom: 14 },
  postRow: { display: "grid", gridTemplateColumns: "100px 1fr", gap: 18, marginBottom: 14 },
  timeCol: { fontWeight: 700, color: "#222", paddingTop: 14, fontSize: 14 },
  postCard: {
    border: "1px solid #E2DED7",
    borderRadius: 8,
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    background: "#FFF"
  },
  postMeta: { color: "#6A6C66", fontSize: 12, marginBottom: 4 },
  postText: { fontWeight: 600, lineHeight: 1.45 },
  mediaUrl: { marginTop: 8, color: "#1D6D3B", fontSize: 12, wordBreak: "break-all" },
  errorText: { marginTop: 8, color: "#B42318", fontSize: 12 },
  statusBadge: { borderRadius: 100, padding: "4px 8px", fontSize: 11, fontWeight: 800, textTransform: "uppercase" },
  queueBadge: { background: "#EEF8E9", color: "#1B7A3D" },
  failedBadge: { background: "#FEE4E2", color: "#B42318" },
  secondarySmall: {
    border: "1px solid #D6D2CA",
    background: "#FFF",
    borderRadius: 7,
    padding: "6px 9px",
    cursor: "pointer",
    fontSize: 12
  },
  connectedBlock: { marginTop: 32 },
  blockTitle: { fontWeight: 800, marginBottom: 12 },
  accountGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 },
  accountCard: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    border: "1px solid #E2DED7",
    borderRadius: 8,
    padding: 12
  },
  calendarGrid: { display: "grid", gridTemplateColumns: "repeat(7, minmax(110px, 1fr))", gap: 8, paddingTop: 24 },
  calendarDay: { minHeight: 260, border: "1px solid #E2DED7", borderRadius: 8, padding: 10, background: "#FCFBF8" },
  calendarHead: { fontWeight: 800, marginBottom: 10 },
  calendarPost: { fontSize: 12, background: "#FFF", border: "1px solid #ECE8E0", borderRadius: 7, padding: 8, marginBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: "50%", display: "inline-block", marginRight: 6 },
  simpleHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  headerSub: { color: "#696A65", marginTop: 4 },
  createToolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", margin: "22px 0" },
  generateButton: { border: "none", background: "#F1EBFF", borderRadius: 8, padding: "10px 16px", fontWeight: 800, cursor: "pointer" },
  ideaBoard: { display: "grid", gridTemplateColumns: "repeat(4, minmax(180px, 1fr))", gap: 22 },
  ideaColumn: { minHeight: 360, background: "#F6F5F2", borderRadius: 8, padding: 10 },
  columnHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 6px 14px" },
  ideaCard: { background: "#FFF", border: "1px solid #E3DFD8", borderRadius: 7, padding: 14, marginBottom: 10 },
  addIdeaButton: { width: "100%", border: "none", background: "transparent", padding: 16, cursor: "pointer", fontWeight: 700, color: "#555" },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 },
  statCard: { border: "1px solid #E2DED7", borderRadius: 8, padding: 18, display: "grid", gap: 12 },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.28)",
    display: "grid",
    placeItems: "center",
    padding: 18,
    zIndex: 20
  },
  composer: { width: "min(640px, 100%)", background: "#FFF", borderRadius: 10, padding: 22, boxShadow: "0 20px 60px rgba(0,0,0,.2)" },
  composerHeader: { display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 18 },
  closeButton: { border: "none", background: "#F0EEE9", borderRadius: 6, width: 30, height: 30, cursor: "pointer" },
  label: { display: "block", margin: "12px 0 6px", fontSize: 12, fontWeight: 800, color: "#5A5D57" },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #D6D2CA",
    borderRadius: 8,
    padding: "11px 12px",
    font: "inherit"
  },
  composerFooter: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 18 },
  statusText: { marginRight: "auto", color: "#5C625C", fontSize: 13 },
  secondaryButton: { border: "1px solid #D6D2CA", background: "#FFF", borderRadius: 8, padding: "10px 14px", cursor: "pointer" },
  primaryButton: { border: "none", background: "#A9EE96", borderRadius: 8, padding: "11px 16px", fontWeight: 800, cursor: "pointer" },
  selectionList: { display: "grid", gap: 10, maxHeight: 420, overflow: "auto", paddingRight: 4 },
  selectionItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    border: "1px solid #E2DED7",
    borderRadius: 8,
    padding: 12,
    cursor: "pointer"
  },
  selectionItemActive: { borderColor: "#88D777", background: "#F2FCEC" },
  selectionEmpty: {
    border: "1px dashed #D6D2CA",
    borderRadius: 8,
    padding: 18,
    color: "#5C625C",
    background: "#FCFBF8"
  },
  helpButton: {
    position: "fixed",
    right: 28,
    bottom: 24,
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: "1px solid #A9D7F9",
    background: "#E5F4FF",
    color: "#0069A8",
    fontWeight: 900,
    cursor: "pointer"
  },
  policyPage: {
    minHeight: "100vh",
    background: "#F7F6F3",
    color: "#151515",
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif",
    padding: "32px 16px"
  },
  policyCard: {
    maxWidth: 860,
    margin: "0 auto",
    background: "#FFF",
    border: "1px solid #DEDBD5",
    borderRadius: 10,
    padding: "32px",
    boxSizing: "border-box"
  },
  policyHeader: { display: "flex", gap: 14, alignItems: "center", marginBottom: 20 },
  policyEyebrow: { margin: 0, color: "#4F5B4F", fontWeight: 800, fontSize: 13 },
  policyIntro: { color: "#4A4D47", lineHeight: 1.7, fontSize: 16, marginBottom: 26 },
  policySection: { borderTop: "1px solid #E4E0D8", paddingTop: 18, marginTop: 18 },
  policyLink: { color: "#1B7A3D", fontWeight: 700 }
};
