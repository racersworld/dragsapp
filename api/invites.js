import { json, bad, db, require, user, RANK, ROLES, eventScoped, token, audit } from "./_lib.js";
const URL_ = () => (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SVC = () => process.env.SUPABASE_SERVICE_KEY || "";
// GET  ?token=X                public: invite details (name, email, role, event) if valid
// POST {accept:true, token, password}   public: create the account from the invite, returns ok
// GET                          event_admin+: pending invites you can see
// POST {name, email, role, event_id?}  event_admin+: create invite (role must be below yours) -> {link}
// DELETE {token}               event_admin+: revoke
export default async function handler(req, res) {
  try {
    const q = req.query || {}, b = req.body || {};
    if (req.method === "GET" && q.token) {
      const inv = (await db(`invites?token=eq.${encodeURIComponent(q.token)}&select=name,email,role,event_id,expires_at,used_at,event:events(name,code)`))[0];
      if (!inv || inv.used_at || new Date(inv.expires_at) < new Date()) return bad(res, "This invite link has expired or was already used", 410);
      return json(res, 200, { ok: true, invite: { name: inv.name, email: inv.email, role: inv.role, event: inv.event ? inv.event.name : null } });
    }
    if (req.method === "POST" && b.accept) {
      if (!b.token || !b.password || b.password.length < 8) return bad(res, "Password must be 8+ characters");
      const inv = (await db(`invites?token=eq.${encodeURIComponent(b.token)}&select=*`))[0];
      if (!inv || inv.used_at || new Date(inv.expires_at) < new Date()) return bad(res, "This invite link has expired or was already used", 410);
      const r = await fetch(`${URL_()}/auth/v1/admin/users`, { method: "POST", headers: { apikey: SVC(), Authorization: `Bearer ${SVC()}`, "Content-Type": "application/json" }, body: JSON.stringify({ email: inv.email, password: b.password, email_confirm: true }) });
      const au = await r.json(); if (!r.ok) throw new Error(au.msg || au.message || "Could not create login (is this email already registered?)");
      await db("profiles", { method: "POST", body: { id: au.id, email: inv.email, name: b.name || inv.name || "", role: inv.role, created_by: inv.created_by }, prefer: "return=minimal" });
      if (inv.event_id) await db("event_assignments", { method: "POST", body: { user_id: au.id, event_id: inv.event_id, assigned_by: inv.created_by }, prefer: "return=minimal" });
      await db(`invites?token=eq.${encodeURIComponent(b.token)}`, { method: "PATCH", body: { used_at: new Date().toISOString(), used_by: au.id }, prefer: "return=minimal" });
      await audit(inv.created_by, "invite_accepted", null, inv.event_id, { user_id: au.id, email: inv.email, role: inv.role });
      return json(res, 200, { ok: true, email: inv.email });
    }
    const u = await require(req, res, "event_admin"); if (!u) return;
    const below = r => RANK[r] < RANK[u.role];
    if (req.method === "GET") {
      const rows = await db(`invites?used_at=is.null&select=token,name,email,role,event_id,expires_at,created_at,created_by&order=created_at.desc`);
      return json(res, 200, { ok: true, invites: rows.filter(i => below(i.role) && (!eventScoped(u) || (u.events || []).includes(i.event_id))) });
    }
    if (req.method === "POST") {
      if (!b.email || !/@/.test(b.email)) return bad(res, "email required");
      const role = ROLES.includes(b.role) ? b.role : "event_staff";
      if (!below(role)) return bad(res, "You can only invite roles below your own", 403);
      if (b.event_id && eventScoped(u) && !(u.events || []).includes(b.event_id)) return bad(res, "You can only invite people to your own event", 403);
      const existing = await db(`profiles?email=eq.${encodeURIComponent(b.email.toLowerCase())}&select=id`);
      if (existing.length) return bad(res, "That email already has a login — assign them to the event instead");
      const t = token() + token();
      const row = { token: t, name: b.name || "", email: b.email.toLowerCase(), role, event_id: (role === "event_staff" || role === "event_admin") && b.event_id ? b.event_id : null, created_by: u.id, expires_at: new Date(Date.now() + 7 * 864e5).toISOString() };
      await db("invites", { method: "POST", body: row, prefer: "return=minimal" });
      const origin = (req.headers["x-forwarded-proto"] || "https") + "://" + (req.headers["x-forwarded-host"] || req.headers.host);
      return json(res, 200, { ok: true, link: `${origin}/?invite=${t}`, invite: row });
    }
    if (req.method === "DELETE") {
      if (!b.token) return bad(res, "token required");
      await db(`invites?token=eq.${encodeURIComponent(b.token)}`, { method: "DELETE", prefer: "return=minimal" });
      return json(res, 200, { ok: true });
    }
    return bad(res, "Method", 405);
  } catch (e) { return bad(res, e.message, 500); }
}
