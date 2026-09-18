import { json, bad, db, require, RANK } from "./_lib.js";
const URL_ = () => (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SVC = () => process.env.SUPABASE_SERVICE_KEY || "";
const ROLES = ["event_staff", "staff", "admin", "super_admin"];
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
    if (req.method === "GET" && (req.query || {}).me) { const u = await require(req, res, "event_staff"); if (!u) return; return json(res, 200, { ok: true, user: u }); }
    const u = await require(req, res, "staff"); if (!u) return;
    const below = r => RANK[r] < RANK[u.role];
    if (req.method === "GET") { const all = await db("profiles?select=*&order=created_at"); return json(res, 200, { ok: true, users: all.filter(x => below(x.role) || x.id === u.id) }); }
    if (req.method === "POST") {
      const b = req.body || {};
      if (!b.email || !b.password || b.password.length < 8) return bad(res, "email and password (8+ chars) required");
      const role = ROLES.includes(b.role) ? b.role : "event_staff";
      if (!below(role)) return bad(res, "You can only create roles below your own", 403);
      if (role === "event_staff" && !b.event_id) return bad(res, "event_staff must be assigned to an event");
      const au = await adminAuth("", "POST", { email: b.email, password: b.password, email_confirm: true });
      const p = await db("profiles", { method: "POST", body: { id: au.id, email: b.email, name: b.name || "", role, event_id: role === "event_staff" ? b.event_id : null, expires_at: b.expires_at || null, created_by: u.id } });
      return json(res, 200, { ok: true, user: p[0] });
    }
    if (req.method === "PATCH") {
      const b = req.body || {}; if (!b.id) return bad(res, "id required");
      const target = (await db(`profiles?id=eq.${b.id}&select=*`))[0]; if (!target) return bad(res, "Not found", 404);
      if (!below(target.role)) return bad(res, "Not allowed", 403);
      const patch = {};
      if (b.role) { if (!ROLES.includes(b.role) || !below(b.role)) return bad(res, "Not allowed", 403); patch.role = b.role; if (b.role !== "event_staff") patch.event_id = null; }
      if (typeof b.name === "string") patch.name = b.name;
      if (typeof b.active === "boolean") patch.active = b.active;
      if (b.event_id !== undefined) patch.event_id = b.event_id || null;
      if (b.expires_at !== undefined) patch.expires_at = b.expires_at || null;
      if (b.password) { if (b.password.length < 8) return bad(res, "password 8+ chars"); await adminAuth(`/${b.id}`, "PUT", { password: b.password }); }
      const p = Object.keys(patch).length ? await db(`profiles?id=eq.${b.id}`, { method: "PATCH", body: patch }) : [target];
      return json(res, 200, { ok: true, user: p[0] });
    }
    return bad(res, "Method", 405);
  } catch (e) { return bad(res, e.message, 500); }
}
