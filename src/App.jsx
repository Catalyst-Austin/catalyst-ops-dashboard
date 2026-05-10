import { useState, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import matter from "gray-matter";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const ENV_TOKEN = import.meta.env.VITE_GITHUB_TOKEN || "";
const VERA_REPO = import.meta.env.VITE_VERA_REPO || "Catalyst-Austin/vera";
const STATE_REPO = import.meta.env.VITE_STATE_REPO || VERA_REPO;
const STATE_BRANCH = import.meta.env.VITE_STATE_BRANCH || "main";

const FULLY_CONFIGURED = !!ENV_TOKEN;
const REFRESH_INTERVAL_MS = 60_000;

const STATE_FILES = {
  queueActive: "state/_queue-active.md",
  inFlight: "state/_in-flight.md",
  currentState: "state/_current-state.yml",
};

const DOSSIER_ROOT = "packages/vera/briefcase";

// ─── GITHUB API HELPERS ──────────────────────────────────────────────────────
async function ghGet(path, token, raw = false) {
  const url = `https://api.github.com${path}`;
  const res = await fetch(url, {
    headers: {
      Accept: raw ? "application/vnd.github.raw" : "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub ${res.status} on ${path}: ${await res.text()}`);
  }
  return raw ? res.text() : res.json();
}

async function fetchFileRaw(repo, path, branch, token) {
  const url = `/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(branch)}`;
  return ghGet(url, token, true);
}

async function fetchTree(repo, branch, token) {
  const ref = await ghGet(`/repos/${repo}/git/refs/heads/${branch}`, token);
  const sha = ref.object.sha;
  return ghGet(`/repos/${repo}/git/trees/${sha}?recursive=1`, token);
}

// ─── PARSERS ─────────────────────────────────────────────────────────────────
function relTime(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function findAllMatches(re, text) {
  const out = [];
  let m;
  while ((m = re.exec(text))) out.push(m);
  return out;
}

function parseQueueActive(md) {
  const sections = { p1: [], p2: [], p3: [] };
  const tierRe = /<!--\s*\[SECTION:(p[123])\]\s*-->([\s\S]*?)<!--\s*\[\/SECTION:\1\]\s*-->/g;
  const matches = findAllMatches(tierRe, md);
  for (const m of matches) {
    const tier = m[1];
    const body = m[2];
    for (const line of body.split("\n")) {
      const match = line.match(/^- \[([ x])\]\s+(?:\[(WO-\d+)\]\(([^)]+)\)|(WO-[A-Z0-9-]+))\s*[—:-]\s*(.+)$/);
      if (match) {
        const checked = match[1] === "x";
        const woId = match[2] || match[4];
        const specPath = match[3] || null;
        const objective = match[5].trim();
        sections[tier].push({ woId, specPath, checked, objective, tier });
      }
    }
  }
  return sections;
}

function parseInFlight(md) {
  const rows = [];
  const tableRe = /\|\s*(WO-[A-Z0-9-]+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/g;
  const matches = findAllMatches(tableRe, md);
  for (const m of matches) {
    if (m[1] === "WO") continue;
    rows.push({
      woId: m[1].trim(),
      agent: m[2].trim(),
      claimed: m[3].trim(),
      repoScope: m[4].trim(),
      state: m[5].trim(),
    });
  }
  return rows;
}

function parseCurrentStateAsOf(yamlText) {
  const m = yamlText.match(/^as_of:\s*(\S+)/m);
  return m ? m[1] : null;
}

function statusPill(item, inFlightIds) {
  if (item.checked) return "in-progress";
  if (inFlightIds.has(item.woId)) return "in-progress";
  if (/user action/i.test(item.objective)) return "user-action";
  if (/blocked|BLOCKED/.test(item.objective)) return "blocked";
  return "queued";
}

// ─── COMPONENTS ──────────────────────────────────────────────────────────────
function Tile({ label, value, tone }) {
  const colors = {
    p1: "var(--p1)",
    p2: "var(--p2)",
    p3: "var(--p3)",
    flight: "var(--accent)",
    neutral: "var(--ink-soft)",
  };
  return (
    <div style={styles.tile}>
      <div style={{ ...styles.tileValue, color: colors[tone] || "var(--ink)" }}>{value}</div>
      <div style={styles.tileLabel}>{label}</div>
    </div>
  );
}

function StatusPill({ status }) {
  const tones = {
    "in-progress": { bg: "rgba(127,119,221,0.18)", fg: "var(--accent)", label: "in flight" },
    "user-action": { bg: "rgba(186,117,23,0.18)", fg: "var(--amber)", label: "user action" },
    blocked: { bg: "rgba(226,75,74,0.18)", fg: "var(--red)", label: "blocked" },
    queued: { bg: "rgba(90,88,82,0.14)", fg: "var(--ink-muted)", label: "queued" },
  };
  const t = tones[status] || tones.queued;
  return (
    <span
      style={{
        background: t.bg,
        color: t.fg,
        padding: "2px 9px",
        borderRadius: 99,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.2,
        whiteSpace: "nowrap",
      }}
    >
      {t.label}
    </span>
  );
}

function TierCard({ tier, items, inFlightIds }) {
  const tierMeta = {
    p1: { label: "P1 — Blocking", color: "var(--p1)" },
    p2: { label: "P2 — Queue Soon", color: "var(--p2)" },
    p3: { label: "P3 — Backlog", color: "var(--p3)" },
  };
  const meta = tierMeta[tier];
  return (
    <section style={styles.tierCard}>
      <header style={{ ...styles.tierHeader, borderLeftColor: meta.color }}>
        <h3 style={{ margin: 0, fontSize: 13, letterSpacing: 0.5, textTransform: "uppercase", color: meta.color }}>
          {meta.label}
        </h3>
        <span style={{ color: "var(--ink-muted)", fontSize: 12 }}>{items.length}</span>
      </header>
      <ul style={styles.tierList}>
        {items.map((item) => {
          const status = statusPill(item, inFlightIds);
          return (
            <li key={item.woId + (item.objective || "").slice(0, 12)} style={styles.tierItem}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <strong style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "var(--ink)" }}>
                  {item.woId}
                </strong>
                <StatusPill status={status} />
                <span style={{ color: "var(--ink-soft)", flex: 1, minWidth: 220 }}>{item.objective}</span>
              </div>
            </li>
          );
        })}
        {items.length === 0 && <li style={{ color: "var(--ink-muted)", padding: "8px 12px" }}>(empty)</li>}
      </ul>
    </section>
  );
}

function QueuePanel() {
  const [queue, setQueue] = useState({ p1: [], p2: [], p3: [] });
  const [inFlight, setInFlight] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [queueText, inFlightText, stateYaml] = await Promise.all([
        fetchFileRaw(STATE_REPO, STATE_FILES.queueActive, STATE_BRANCH, ENV_TOKEN),
        fetchFileRaw(STATE_REPO, STATE_FILES.inFlight, STATE_BRANCH, ENV_TOKEN),
        fetchFileRaw(STATE_REPO, STATE_FILES.currentState, STATE_BRANCH, ENV_TOKEN),
      ]);
      setQueue(parseQueueActive(queueText));
      setInFlight(parseInFlight(inFlightText));
      setLastUpdated(parseCurrentStateAsOf(stateYaml));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const inFlightIds = useMemo(() => new Set(inFlight.map((r) => r.woId)), [inFlight]);

  if (loading) return <div style={styles.loading}>Loading queue…</div>;
  if (error) {
    return (
      <div style={styles.errorBox}>
        <strong>Could not load queue.</strong>
        <div style={{ marginTop: 6, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }}>{error}</div>
        <div style={{ marginTop: 10, color: "var(--ink-soft)" }}>
          Make sure <code>VITE_GITHUB_TOKEN</code> has <code>contents:read</code> on{" "}
          <code>{STATE_REPO}</code>, and that <code>{STATE_FILES.queueActive}</code> exists at branch{" "}
          <code>{STATE_BRANCH}</code>.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={styles.tileRow}>
        <Tile label="P1 blocking" value={queue.p1.length} tone="p1" />
        <Tile label="P2 queue soon" value={queue.p2.length} tone="p2" />
        <Tile label="P3 backlog" value={queue.p3.length} tone="p3" />
        <Tile label="In flight" value={inFlight.length} tone="flight" />
        <Tile label="Last synced" value={lastUpdated ? relTime(lastUpdated) : "—"} tone="neutral" />
      </div>

      <section style={styles.tierCard}>
        <header style={{ ...styles.tierHeader, borderLeftColor: "var(--accent)" }}>
          <h3 style={{ margin: 0, fontSize: 13, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--accent)" }}>
            In flight
          </h3>
          <span style={{ color: "var(--ink-muted)", fontSize: 12 }}>{inFlight.length}</span>
        </header>
        <ul style={styles.tierList}>
          {inFlight.map((row) => (
            <li key={row.woId} style={styles.tierItem}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <strong style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{row.woId}</strong>
                <StatusPill status="in-progress" />
                <span style={{ color: "var(--ink-soft)" }}>{row.agent}</span>
                <span style={{ color: "var(--ink-muted)", fontSize: 12 }}>claimed {row.claimed}</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: "var(--ink-muted)" }}>{row.state}</div>
            </li>
          ))}
          {inFlight.length === 0 && <li style={{ color: "var(--ink-muted)", padding: "8px 12px" }}>(nothing claimed)</li>}
        </ul>
      </section>

      <TierCard tier="p1" items={queue.p1} inFlightIds={inFlightIds} />
      <TierCard tier="p2" items={queue.p2} inFlightIds={inFlightIds} />
      <TierCard tier="p3" items={queue.p3} inFlightIds={inFlightIds} />

      <div style={styles.footer}>
        Synced from <code>{STATE_REPO}</code> @ <code>{STATE_BRANCH}</code> · auto-refresh every {REFRESH_INTERVAL_MS / 1000}s
      </div>
    </div>
  );
}

function DossierPanel() {
  const [dossiers, setDossiers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [body, setBody] = useState({ frontmatter: {}, content: "" });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const tree = await fetchTree(VERA_REPO, STATE_BRANCH, ENV_TOKEN);
        const list = tree.tree
          .filter(
            (n) =>
              n.type === "blob" &&
              n.path.startsWith(`${DOSSIER_ROOT}/`) &&
              /\/dossier-[^/]+\.md$/.test(n.path)
          )
          .map((n) => {
            const rel = n.path.slice(DOSSIER_ROOT.length + 1);
            const segs = rel.split("/");
            const file = segs.pop();
            const bucket = segs.join("/") || "(root)";
            const subject = file.replace(/^dossier-/, "").replace(/\.md$/, "");
            return { path: n.path, file, bucket, subject };
          });
        list.sort((a, b) => a.bucket.localeCompare(b.bucket) || a.subject.localeCompare(b.subject));
        setDossiers(list);
        if (list.length > 0) setSelected(list[0]);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selected) return;
    (async () => {
      try {
        const text = await fetchFileRaw(VERA_REPO, selected.path, STATE_BRANCH, ENV_TOKEN);
        const parsed = matter(text);
        setBody({ frontmatter: parsed.data || {}, content: parsed.content });
      } catch (err) {
        setBody({ frontmatter: {}, content: `**Error loading dossier:**\n\n\`\`\`\n${err.message}\n\`\`\`` });
      }
    })();
  }, [selected]);

  const filtered = useMemo(() => {
    if (!search.trim()) return dossiers;
    const s = search.toLowerCase();
    return dossiers.filter(
      (d) => d.subject.toLowerCase().includes(s) || d.bucket.toLowerCase().includes(s)
    );
  }, [dossiers, search]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const d of filtered) {
      if (!map.has(d.bucket)) map.set(d.bucket, []);
      map.get(d.bucket).push(d);
    }
    return map;
  }, [filtered]);

  const fm = body.frontmatter;
  const lastRendered = fm.last_rendered || fm.created || null;
  const staleDays = Number(fm.stale_after_days) || null;
  const isStale = useMemo(() => {
    if (!lastRendered || !staleDays) return false;
    const ageDays = (Date.now() - new Date(lastRendered).getTime()) / 86_400_000;
    return ageDays > staleDays;
  }, [lastRendered, staleDays]);

  if (loading) return <div style={styles.loading}>Loading dossiers…</div>;
  if (error) {
    return (
      <div style={styles.errorBox}>
        <strong>Could not load dossiers.</strong>
        <div style={{ marginTop: 6, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }}>{error}</div>
        <div style={{ marginTop: 10, color: "var(--ink-soft)" }}>
          Verify <code>VITE_GITHUB_TOKEN</code> has <code>contents:read</code> on <code>{VERA_REPO}</code> and that{" "}
          <code>{DOSSIER_ROOT}/</code> contains <code>dossier-*.md</code> files.
        </div>
      </div>
    );
  }

  return (
    <div style={styles.dossierLayout}>
      <aside style={styles.sidebar}>
        <input
          type="search"
          placeholder="Filter dossiers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
        />
        {[...grouped.entries()].map(([bucket, items]) => (
          <div key={bucket} style={{ marginBottom: 14 }}>
            <div style={styles.sidebarGroupLabel}>{bucket}</div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {items.map((d) => {
                const active = selected && selected.path === d.path;
                return (
                  <li key={d.path}>
                    <button
                      onClick={() => setSelected(d)}
                      style={{
                        ...styles.sidebarItem,
                        background: active ? "rgba(127,119,221,0.16)" : "transparent",
                        color: active ? "var(--accent)" : "var(--ink-soft)",
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {d.subject}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ color: "var(--ink-muted)", fontSize: 12 }}>No matches.</div>
        )}
      </aside>
      <main style={styles.dossierPane}>
        {selected ? (
          <>
            <header style={styles.dossierHeader}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>{selected.subject}</h2>
                <div style={{ marginTop: 6, color: "var(--ink-muted)", fontSize: 12 }}>
                  <code>{selected.path}</code>
                </div>
              </div>
              <a
                href={`https://github.com/${VERA_REPO}/blob/${STATE_BRANCH}/${selected.path}`}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.viewOnGithub}
              >
                View on GitHub ↗
              </a>
            </header>
            <div style={styles.frontmatterStrip}>
              {fm.subject && <Pair k="subject" v={fm.subject} />}
              {fm.subject_type && <Pair k="type" v={fm.subject_type} />}
              {fm.version && <Pair k="version" v={fm.version} />}
              {fm.confidence && <Pair k="confidence" v={fm.confidence} />}
              {lastRendered && <Pair k="last rendered" v={String(lastRendered)} />}
              {isStale && (
                <span style={{ background: "rgba(226,75,74,0.15)", color: "var(--red)", padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 600 }}>
                  stale
                </span>
              )}
            </div>
            <article className="md-body" style={{ marginTop: 18 }}>
              <ReactMarkdown>{body.content}</ReactMarkdown>
            </article>
          </>
        ) : (
          <div style={{ color: "var(--ink-muted)" }}>Pick a dossier from the sidebar.</div>
        )}
      </main>
    </div>
  );
}

function Pair({ k, v }) {
  return (
    <span style={styles.pair}>
      <span style={{ color: "var(--ink-muted)" }}>{k}:</span> <strong>{String(v)}</strong>
    </span>
  );
}

// ─── ROOT APP ────────────────────────────────────────────────────────────────
function App() {
  const [tab, setTab] = useState("queue");

  if (!FULLY_CONFIGURED) {
    return (
      <div style={{ ...styles.shell, padding: 40 }}>
        <h1 style={{ margin: 0 }}>Catalyst Ops</h1>
        <div style={{ ...styles.errorBox, marginTop: 20 }}>
          <strong>Missing configuration.</strong>
          <div style={{ marginTop: 6 }}>
            Set <code>VITE_GITHUB_TOKEN</code> in <code>.env.local</code> (local dev) or in Vercel project settings
            (production). The token needs <code>contents:read</code> on <code>{VERA_REPO}</code>.
          </div>
          <div style={{ marginTop: 6 }}>
            See <code>.env.example</code> for the full env-var list.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.shell}>
      <header style={styles.appHeader}>
        <div>
          <h1 style={styles.appTitle}>Catalyst Ops</h1>
          <div style={styles.appSubtitle}>
            Live WO queue + dossier reader · reading <code>{VERA_REPO}</code>
          </div>
        </div>
        <nav style={styles.nav}>
          <NavTab active={tab === "queue"} onClick={() => setTab("queue")}>
            WO Queue
          </NavTab>
          <NavTab active={tab === "dossiers"} onClick={() => setTab("dossiers")}>
            Dossiers
          </NavTab>
        </nav>
      </header>
      <div style={styles.content}>{tab === "queue" ? <QueuePanel /> : <DossierPanel />}</div>
    </div>
  );
}

function NavTab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.navTab,
        background: active ? "var(--ink)" : "transparent",
        color: active ? "var(--bg)" : "var(--ink-soft)",
      }}
    >
      {children}
    </button>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const styles = {
  shell: { maxWidth: 1200, margin: "0 auto", padding: "24px 24px 60px" },
  appHeader: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 28, paddingBottom: 16, borderBottom: "1px solid var(--line)" },
  appTitle: { margin: 0, fontSize: 28, letterSpacing: -0.5 },
  appSubtitle: { color: "var(--ink-muted)", fontSize: 13, marginTop: 4 },
  nav: { display: "flex", gap: 4, padding: 4, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8 },
  navTab: { border: "none", padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, transition: "all 0.15s" },
  content: {},
  tileRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 },
  tile: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, padding: "14px 16px" },
  tileValue: { fontSize: 22, fontWeight: 700, lineHeight: 1.1 },
  tileLabel: { color: "var(--ink-muted)", fontSize: 12, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.4 },
  tierCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, marginBottom: 16, overflow: "hidden" },
  tierHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "var(--bg)", borderLeft: "4px solid", borderBottom: "1px solid var(--line)" },
  tierList: { listStyle: "none", margin: 0, padding: 0 },
  tierItem: { padding: "10px 16px", borderBottom: "1px solid var(--line)" },
  footer: { color: "var(--ink-muted)", fontSize: 11, textAlign: "right", marginTop: 12 },
  loading: { padding: 24, color: "var(--ink-muted)" },
  errorBox: { background: "var(--panel)", border: "1px solid var(--red)", borderRadius: 8, padding: 18, color: "var(--ink)" },
  dossierLayout: { display: "grid", gridTemplateColumns: "minmax(220px, 280px) 1fr", gap: 20 },
  sidebar: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, padding: 14, maxHeight: "70vh", overflowY: "auto" },
  searchInput: { width: "100%", padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 6, fontSize: 13, marginBottom: 12, background: "var(--bg)", color: "var(--ink)" },
  sidebarGroupLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ink-muted)", marginBottom: 4, paddingLeft: 4 },
  sidebarItem: { display: "block", width: "100%", textAlign: "left", padding: "5px 8px", border: "none", borderRadius: 4, fontSize: 13, cursor: "pointer" },
  dossierPane: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, padding: 22, minHeight: "70vh" },
  dossierHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", borderBottom: "1px solid var(--line)", paddingBottom: 12 },
  viewOnGithub: { fontSize: 12, color: "var(--blue)" },
  frontmatterStrip: { display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginTop: 12, padding: "10px 12px", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 6 },
  pair: { fontSize: 12 },
};

export default App;
