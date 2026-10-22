require("dotenv").config();
const express = require("express");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const GROUP_ID = process.env.GROUP_ID || "15668427";
const ADMIN_ID = String(process.env.ADMIN_ROBLOX_USER_ID || "").trim();
const CLIENT_ID = process.env.ROBLOX_CLIENT_ID || "";
const CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET || "";
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "site-data.json");

app.set("trust proxy", 1);
app.use(express.json({ limit: "20kb" }));
app.use(session({
  name: "cnj.sid",
  store: new FileStore({ path: path.join(__dirname, "data", "sessions"), retries: 1, logFn: () => {} }),
  secret: process.env.SESSION_SECRET || "CHANGE_THIS_SESSION_SECRET_BEFORE_DEPLOYING",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 60 * 8 }
}));
app.use(express.static(path.join(__dirname, "public")));

const redirectUri = `${BASE_URL}/auth/callback`;
const initialData = {
  blacklist: [],
  projects: [
    { id: "tail-tag", title: "[KR] 꼬리 잡기!", status: "개발 중", description: "꼬리를 빼앗고 팀원과 협력해 승리하는 멀티플레이 게임입니다.", imageUrl: "", gameUrl: "", updatedAt: new Date().toISOString() },
    { id: "blackout-site-09", title: "BLACKOUT: SITE 09", status: "개발 중", description: "어두운 시설을 탐색하고 목표를 해결하며 위협을 피하는 호러 게임입니다.", imageUrl: "", gameUrl: "", updatedAt: new Date().toISOString() }
  ]
};
function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
}
function readData() {
  ensureData();
  try { return { ...initialData, ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) }; }
  catch (e) { console.error("Could not read site data:", e.message); return { ...initialData }; }
}
function writeData(data) {
  ensureData();
  const temp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, DATA_FILE);
}
function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "먼저 Roblox 계정으로 로그인해 주세요." });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Roblox 로그인이 필요합니다." });
  if (!ADMIN_ID || String(req.session.user.sub) !== ADMIN_ID) return res.status(403).json({ error: "관리자 계정만 사용할 수 있습니다." });
  // For state-changing requests, require same-origin browser requests.
  if (["POST", "PUT", "DELETE"].includes(req.method)) {
    const origin = req.get("origin");
    if (origin && new URL(origin).host !== new URL(BASE_URL).host) return res.status(403).json({ error: "요청 출처를 확인할 수 없습니다." });
  }
  next();
}
async function fetchJson(url, options = {}) {
  const r = await fetch(url, options);
  const body = await r.text();
  let data;
  try { data = JSON.parse(body); } catch { data = { message: body }; }
  if (!r.ok) throw new Error(data.message || `Roblox API 오류 (${r.status})`);
  return data;
}
function cleanText(value, max) { return String(value ?? "").trim().slice(0, max); }
function validHttpUrl(value) {
  if (!value) return true;
  try { const u = new URL(value); return u.protocol === "https:"; } catch { return false; }
}

app.get("/api/config", (req, res) => {
  res.json({
    groupId: GROUP_ID, loggedIn: Boolean(req.session.user),
    user: req.session.user ? { id: req.session.user.sub, username: req.session.user.preferred_username || req.session.user.nickname || "Roblox User", picture: req.session.user.picture || null, isAdmin: Boolean(ADMIN_ID && String(req.session.user.sub) === ADMIN_ID) } : null,
    oauthConfigured: Boolean(CLIENT_ID && CLIENT_SECRET),
    groupUrl: `https://www.roblox.com/communities/${GROUP_ID}/CnJ-Studio#!/about`
  });
});

app.get("/auth/login", (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) return res.status(503).send("Roblox OAuth 설정이 아직 완료되지 않았습니다. README.md를 따라 설정해 주세요.");
  const state = crypto.randomBytes(24).toString("hex");
  const nonce = crypto.randomBytes(24).toString("hex");
  req.session.oauthState = state;
  req.session.oauthNonce = nonce;
  const params = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: redirectUri, scope: "openid profile", response_type: "code", state, nonce });
  res.redirect(`https://apis.roblox.com/oauth/v1/authorize?${params.toString()}`);
});

app.get("/auth/callback", async (req, res) => {
  try {
    if (!req.query.code || !req.query.state || req.query.state !== req.session.oauthState) return res.status(400).send("로그인 검증에 실패했습니다. 다시 로그인해 주세요.");
    const tokenBody = new URLSearchParams({ grant_type: "authorization_code", code: String(req.query.code), redirect_uri: redirectUri, client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
    const token = await fetchJson("https://apis.roblox.com/oauth/v1/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: tokenBody });
    const user = await fetchJson("https://apis.roblox.com/oauth/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } });
    // Replace the session ID after authentication to reduce session-fixation risk.
    req.session.regenerate(err => {
      if (err) return res.status(500).send("로그인 세션을 만들지 못했습니다. 다시 시도해 주세요.");
      req.session.user = { sub: String(user.sub), preferred_username: user.preferred_username || user.nickname || "Roblox User", nickname: user.nickname || "", picture: user.picture || null };
      req.session.save(() => res.redirect("/"));
    });
  } catch (e) {
    console.error("OAuth callback error:", e.message);
    res.status(500).send("Roblox 로그인에 실패했습니다. OAuth 설정과 Redirect URL을 확인해 주세요.");
  }
});

app.post("/auth/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get("/api/member", async (req, res) => {
  const username = cleanText(req.query.username, 40);
  if (!username) return res.status(400).json({ error: "Roblox 닉네임을 입력해 주세요." });
  try {
    const search = await fetchJson("https://users.roblox.com/v1/usernames/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }) });
    const found = search.data && search.data[0];
    if (!found) return res.status(404).json({ error: "해당 Roblox 사용자를 찾을 수 없습니다." });
    let role = null, inGroup = false;
    const groups = await fetchJson(`https://groups.roblox.com/v2/users/${found.id}/groups/roles`);
    const membership = (groups.data || []).find(x => String(x.group?.id) === String(GROUP_ID));
    if (membership) { inGroup = true; role = membership.role?.name || "Member"; }
    let avatar = null;
    try { const avatarData = await fetchJson(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${found.id}&size=150x150&format=Png&isCircular=true`); avatar = avatarData.data?.[0]?.imageUrl || null; } catch {}
    res.json({ id: found.id, username: found.name, displayName: found.displayName || found.name, avatar, inGroup, role: role || (inGroup ? "Member" : null), profileUrl: `https://www.roblox.com/users/${found.id}/profile`, groupUrl: `https://www.roblox.com/communities/${GROUP_ID}/CnJ-Studio#!/about` });
  } catch (e) { console.error("Member lookup error:", e.message); res.status(502).json({ error: "Roblox 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }); }
});

// Public pages show only entries explicitly approved for public display.
app.get("/api/blacklist", (req, res) => {
  const data = readData();
  res.json({ entries: data.blacklist.filter(x => x.public === true).map(({ id, username, reason, createdAt }) => ({ id, username, reason, createdAt })) });
});
app.get("/api/projects", (req, res) => {
  const data = readData();
  res.json({ projects: data.projects.map(p => ({ id: p.id, title: p.title, status: p.status, description: p.description, imageUrl: p.imageUrl, gameUrl: p.gameUrl, updatedAt: p.updatedAt })) });
});
app.get("/api/admin/status", requireAdmin, (req, res) => res.json({ ok: true, admin: req.session.user.preferred_username, message: "관리자 인증 완료", note: "이 사이트의 관리자 권한은 로그인한 Roblox 계정의 숫자 ID와 서버 설정이 일치할 때만 부여됩니다." }));
app.get("/api/admin/data", requireAdmin, (req, res) => {
  const data = readData();
  res.json({ blacklist: data.blacklist, projects: data.projects });
});
app.post("/api/admin/blacklist", requireAdmin, (req, res) => {
  const username = cleanText(req.body.username, 40);
  const userId = cleanText(req.body.userId, 24);
  const reason = cleanText(req.body.reason, 240);
  const isPublic = req.body.public === true;
  if (!username || !/^\d+$/.test(userId) || !reason) return res.status(400).json({ error: "Roblox 사용자 이름, 숫자 ID, 사유를 모두 입력해 주세요." });
  const data = readData();
  if (data.blacklist.some(x => String(x.userId) === userId)) return res.status(409).json({ error: "이미 등록된 사용자 ID입니다." });
  const entry = { id: crypto.randomUUID(), username, userId, reason, public: isPublic, createdAt: new Date().toISOString(), createdBy: req.session.user.preferred_username || "Admin" };
  data.blacklist.unshift(entry); writeData(data); res.status(201).json({ entry });
});
app.delete("/api/admin/blacklist/:id", requireAdmin, (req, res) => {
  const data = readData(); const before = data.blacklist.length;
  data.blacklist = data.blacklist.filter(x => x.id !== req.params.id);
  if (before === data.blacklist.length) return res.status(404).json({ error: "해당 항목을 찾을 수 없습니다." });
  writeData(data); res.json({ ok: true });
});
app.post("/api/admin/projects", requireAdmin, (req, res) => {
  const title = cleanText(req.body.title, 80), status = cleanText(req.body.status, 30), description = cleanText(req.body.description, 500);
  const imageUrl = cleanText(req.body.imageUrl, 500), gameUrl = cleanText(req.body.gameUrl, 500);
  if (!title || !status || !description) return res.status(400).json({ error: "게임 이름, 상태, 설명을 입력해 주세요." });
  if (!validHttpUrl(imageUrl) || !validHttpUrl(gameUrl)) return res.status(400).json({ error: "이미지와 게임 주소는 https:// 주소만 사용할 수 있습니다." });
  const data = readData();
  const project = { id: crypto.randomUUID(), title, status, description, imageUrl, gameUrl, updatedAt: new Date().toISOString() };
  data.projects.unshift(project); writeData(data); res.status(201).json({ project });
});
app.delete("/api/admin/projects/:id", requireAdmin, (req, res) => {
  const data = readData(); const before = data.projects.length;
  data.projects = data.projects.filter(x => x.id !== req.params.id);
  if (before === data.projects.length) return res.status(404).json({ error: "해당 프로젝트를 찾을 수 없습니다." });
  writeData(data); res.json({ ok: true });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => {
  ensureData();
  console.log(`CnJ Studio portal running at ${BASE_URL}`);
  if (!ADMIN_ID) console.warn("ADMIN_ROBLOX_USER_ID is not configured; admin panel remains locked.");
  if (process.env.NODE_ENV === "production") console.warn("Production note: configure persistent storage and a persistent session store before relying on long-term records.");
});
