import { json, bad, db, require, RANK, scoped, audit } from "./_lib.js";
// Event assignments for event_admin / event_staff.
// GET ?event=<id>            event_admin+ (scoped): who is assigned to this event
// POST {user_id, event_id, action: "add"|"remove"}   event_admin+ (scoped to event); target must be below your rank
export default async function handler(req, res) {
  try {
    const u = await require(req, res, "event_admin"); if (!u) return;
    if (req.method === "GET") {
      const ev = (req.query || {}).event; if (!ev) return bad(res, "event required");
      if (!scoped(u, ev)) return bad(res, "Not your event", 403);
      const rows = await db(`event_assignments?event_id=eq.${ev}&select=user_id,created_at,profile:profiles!event_assignments_user_id_fkey(id,name,email,role,active)`);
      return json(res, 200, { ok: true, assignments: rows });
    }
    if (req.method === "POST") {
      const { user_id, event_id, action } = req.body || {};
      if (!user_id || !event_id) return bad(res, "user_id and event_id required");
      if (!scoped(u, event_id)) return bad(res, "Not your event", 403);
      const t = (await db(`profiles?id=eq.${user_id}&select=id,role`))[0]; if (!t) return bad(res, "User not found", 404);
      if (RANK[t.role] >= RANK[u.role]) return bad(res, "Not allowed", 403);
      if (action === "remove") { await db(`event_assignments?user_id=eq.${user_id}&event_id=eq.${event_id}`, { method: "DELETE", prefer: "return=minimal" }); }
      else { await db("event_assignments", { method: "POST", body: { user_id, event_id, assigned_by: u.id }, prefer: "resolution=ignore-duplicates,return=minimal" }); }
      await audit(u.id, action === "remove" ? "unassign" : "assign", null, event_id, { user_id });
      return json(res, 200, { ok: true });
    }
    return bad(res, "Method", 405);
  } catch (e) { return bad(res, e.message, 500); }
}
