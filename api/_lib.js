// Shared helpers for the RACERS Sign-On API. Files starting with _ are not exposed as routes.
const URL_ = () => (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SVC = () => process.env.SUPABASE_SERVICE_KEY || "";
const ANON = () => process.env.SUPABASE_ANON_KEY || "";
export const RANK = { event_staff: 1, staff: 2, admin: 3, super_admin: 4 };

export function json(res, status, body) { res.setHeader("Cache-Control", "no-store"); return res.status(status).json(body); }
export function bad(res, msg, status = 400) { return json(res, status, { ok: false, error: msg }); }

// REST call as service role
export async function db(path, { method = "GET", body, prefer } = {}) {
  const r = await fetch(`${URL_()}/rest/v1/${path}`, {
    method, headers: { apikey: SVC(), Authorization: `Bearer ${SVC()}`, "Content-Type": "application/json", Prefer: prefer || (method === "GET" ? "" : "return=representation") },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new Error((data && data.message) || `db ${r.status}`);
  return data;
}

// Verify the caller's Supabase JWT and load their profile. Returns null if not logged in.
export async function user(req) {
  const h = req.headers.authorization || "";
  const tok = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!tok) return null;
  const r = await fetch(`${URL_()}/auth/v1/user`, { headers: { apikey: ANON(), Authorization: `Bearer ${tok}` } });
  if (!r.ok) return null;
  const u = await r.json();
  const p = await db(`profiles?id=eq.${u.id}&select=*`);
  if (!p || !p[0] || !p[0].active) return null;
  if (p[0].expires_at && new Date(p[0].expires_at) < new Date()) return null;
  return p[0];
}
// Event-scoped check: event_staff may only touch their own event.
export function scoped(u, event_id) { return u.role !== "event_staff" || !event_id || u.event_id === event_id; }
export async function require(req, res, role = "event_staff") {
  const u = await user(req);
  if (!u) { bad(res, "Login required", 401); return null; }
  if (RANK[u.role] < RANK[role]) { bad(res, "Not allowed", 403); return null; }
  return u;
}

// Storage
export async function putImage(path, dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl || "");
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  const r = await fetch(`${URL_()}/storage/v1/object/signon/${path}`, { method: "POST", headers: { Authorization: `Bearer ${SVC()}`, "Content-Type": m[1], "x-upsert": "true" }, body: buf });
  if (!r.ok) throw new Error("storage " + r.status + " " + (await r.text()));
  return path;
}
export async function signUrl(path, expires = 3600) {
  if (!path) return null;
  const r = await fetch(`${URL_()}/storage/v1/object/sign/signon/${path}`, { method: "POST", headers: { Authorization: `Bearer ${SVC()}`, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: expires }) });
  if (!r.ok) return null;
  const j = await r.json();
  return `${URL_()}/storage/v1${j.signedURL}`;
}
export async function audit(who, action, sign_on_id, event_id, detail) {
  try { await db("audit_log", { method: "POST", body: { who, action, sign_on_id, event_id, detail }, prefer: "return=minimal" }); } catch {}
}
export async function eventByCode(code) {
  if (!code) return null;
  const e = await db(`events?code=eq.${encodeURIComponent(code.toUpperCase())}&select=*`);
  return e && e[0] ? e[0] : null;
}
export const token = () => Array.from(crypto.getRandomValues(new Uint8Array(12))).map(b => b.toString(16).padStart(2, "0")).join("");
