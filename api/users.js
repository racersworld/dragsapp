import { json, bad, db, require } from "./_lib.js";
const URL_ = () => (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SVC = () => process.env.SUPABASE_SERVICE_KEY || "";
async function adminAuth(path, method, body) {
  const r = await fetch(`${URL_()}/auth/v1/admin/users${path}`, { method, headers: { apikey: SVC(), Authorization: `Bearer ${SVC()}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(j.msg || j.message || j.error_description || "auth admin error"); return j;
}
// GET            super_admin: list users
// POST           super_admin: {email, password, name, role} create
// PATCH          super_admin: {id, role?, name?, active?, password?}
// GET ?me=1      any logged-in user: own profile
export default async function handler(req, res) {
  try {
    if (req.method === "GET" && (req.query || {}).me) { const u = await require(req, res, "staff"); if (!u) return; return json(res, 200, { ok: true, user: u }); }
    const u = await require(req, res, "super_admin"); if (!u) return;
    if (req.method === "GET") return json(res, 200, { ok: true, users: await db("profiles?select=*&order=created_at") });
    if (req.method === "POST") {
      const b = req.body || {};
      if (!b.email || !b.password || b.password.length < 8) return bad(res, "email and password (8+ chars) required");
      const role = ["staff", "admin", "super_admin"].includes(b.role) ? b.role : "staff";
      const au = await adminAuth("", "POST", { email: b.email, password: b.password, email_confirm: true });
      const p = await db("profiles", { method: "POST", body: { id: au.id, email: b.email, name: b.name || "", role } });
      return json(res, 200, { ok: true, user: p[0] });
    }
    if (req.method === "PATCH") {
      const b = req.body || {};
      if (!b.id) return bad(res, "id required");
      const patch = {};
      if (b.role && ["staff", "admin", "super_admin"].includes(b.role)) patch.role = b.role;
      if (typeof b.name === "string") patch.name = b.name;
      if (typeof b.active === "boolean") patch.active = b.active;
      if (b.password) { if (b.password.length < 8) return bad(res, "password 8+ chars"); await adminAuth(`/${b.id}`, "PUT", { password: b.password }); }
      const p = Object.keys(patch).length ? await db(`profiles?id=eq.${b.id}`, { method: "PATCH", body: patch }) : await db(`profiles?id=eq.${b.id}&select=*`);
      return json(res, 200, { ok: true, user: p[0] });
    }
    return bad(res, "Method", 405);
  } catch (e) { return bad(res, e.message, 500); }
}
