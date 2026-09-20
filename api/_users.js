import { json, bad, db, require, RANK, ROLES, eventScoped } from "./_lib.js";
const URL_ = () => (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SVC = () => process.env.SUPABASE_SERVICE_KEY || "";
async function adminAuth(path, method, body) {
  const r = await fetch(`${URL_()}/auth/v1/admin/users${path}`, { method, headers: { apikey: SVC(), Authorization: `Bearer ${SVC()}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(j.msg || j.message || j.error_description || "auth admin error"); return j;
}
// Hierarchy: super_admin > admin > staff > event_staff. You can only create/edit roles strictly below your own.
// staff may only create event_staff, and only for an event.
// GET ?me=1      own profile
// GET            staff+: users below your rank (staff see event_staff only)
// POST           {email, password, name, role, event_id?, expires_at?}
// PATCH          {id, role?, name?, active?, password?, event_id?, expires_at?}
export default async function handler(req, res) {
  try {
    if (req.method === "POST" && (req.body || {}).heartbeat) { const u = await require(req, res, "event_staff"); if (!u) return; const b = req.body.heartbeat; await db(`profiles?id=eq.${u.id}`, { method: "PATCH", body: { last_seen_at: new Date().toISOString(), last_device: b.device || null, last_station: b.station || null, last_event_id: b.event_id || null }, prefer: "return=minimal" }); return json(res, 200, { ok: true }); }
    if (req.method === "POST" && (req.body || {}).login) { const u = await require(req, res, "event_staff"); if (!u) return; const b = req.body.login; await db("audit_log", { method: "POST", body: { who: u.id, action: "login", detail: { device: b.device || null, station: b.station || null, ua: String(req.headers["user-agent"] || "").slice(0, 120), role: u.role } }, prefer: "return=minimal" }); return json(res, 200, { ok: true }); }
    if (req.method === "GET" && (req.query || {}).me) { const u = await require(req, res, "event_staff"); if (!u) return; return json(res, 200, { ok: true, user: u }); }
    if (req.method === "POST" && (req.body || {}).training) { const u = await require(req, res, "event_staff"); if (!u) return; const t = req.body.training; if (!t.track || typeof t.score !== "number" || t.score < 80) return bad(res, "Not a pass"); const p = await db(`profiles?id=eq.${u.id}`, { method: "PATCH", body: { training_track: String(t.track).slice(0, 30), training_score: Math.round(t.score), training_passed_at: new Date().toISOString() } }); return json(res, 200, { ok: true, user: p[0] }); }
    const u = await require(req, res, "event_admin"); if (!u) return;
    const below = r => RANK[r] < RANK[u.role];
    const scopedRole = r => r === "event_staff" || r === "event_admin";
    if (req.method === "GET") { const all = await db("profiles?select=*&order=created_at"); const asg = await db("event_assignments?select=user_id,event_id"); const byUser = {}; asg.forEach(a => (byUser[a.user_id] = byUser[a.user_id] || []).push(a.event_id));
      return json(res, 200, { ok: true, users: all.filter(x => below(x.role) || x.id === u.id).map(x => ({ ...x, events: byUser[x.id] || [] })) }); }
    if (req.method === "POST") {
      const b = req.body || {};
      if (!b.email || !b.password || b.password.length < 8) return bad(res, "email and password (8+ chars) required");
      const role = ROLES.includes(b.role) ? b.role : "event_staff";
      if (!below(role)) return bad(res, "You can only create roles below your own", 403);
      if (b.event_id && eventScoped(u) && !(u.events || []).includes(b.event_id)) return bad(res, "You can only add people to your own event", 403);
      const au = await adminAuth("", "POST", { email: b.email, password: b.password, email_confirm: true });
      const p = await db("profiles", { method: "POST", body: { id: au.id, email: b.email, name: b.name || "", role, expires_at: b.expires_at || null, created_by: u.id } });
      if (scopedRole(role) && b.event_id) await db("event_assignments", { method: "POST", body: { user_id: au.id, event_id: b.event_id, assigned_by: u.id }, prefer: "return=minimal" });
      return json(res, 200, { ok: true, user: p[0] });
    }
    if (req.method === "PATCH") {
      const b = req.body || {}; if (!b.id) return bad(res, "id required");
      const target = (await db(`profiles?id=eq.${b.id}&select=*`))[0]; if (!target) return bad(res, "Not found", 404);
      if (!below(target.role)) return bad(res, "Not allowed", 403);
      const patch = {};
      if (b.role) { if (!ROLES.includes(b.role) || !below(b.role)) return bad(res, "Not allowed", 403); patch.role = b.role; }
      if (typeof b.name === "string") patch.name = b.name;
      if (typeof b.active === "boolean") patch.active = b.active;
      if (b.expires_at !== undefined) patch.expires_at = b.expires_at || null;
      if (b.password) { if (b.password.length < 8) return bad(res, "password 8+ chars"); await adminAuth(`/${b.id}`, "PUT", { password: b.password }); }
      const p = Object.keys(patch).length ? await db(`profiles?id=eq.${b.id}`, { method: "PATCH", body: patch }) : [target];
      return json(res, 200, { ok: true, user: p[0] });
    }
    return bad(res, "Method", 405);
  } catch (e) { return bad(res, e.message, 500); }
}
