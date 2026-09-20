import { json, bad, db, require } from "./_lib.js";
// GET ?event=<id>&limit=200   admin+: audit trail (edits, deletes, approvals, assignments) with who
export default async function handler(req, res) {
  try {
    const u = await require(req, res, "admin"); if (!u) return;
    const q = req.query || {};
    let f = q.event ? `event_id=eq.${q.event}` : "id=gt.0";
    if (q.actions === "login") { if (u.role !== "god") return bad(res, "Not allowed", 403); f = "action=eq.login"; }
    else { if (q.actions) f += `&action=in.(${q.actions})`; f += "&action=neq.login"; }
    const rows = await db(`audit_log?${f}&select=id,at,action,sign_on_id,event_id,detail,who,person:profiles!audit_log_who_fkey(name,email)&order=at.desc&limit=${Math.min(+q.limit || 300, 2000)}`);
    return json(res, 200, { ok: true, log: rows.map(r => ({ ...r, who_name: r.person ? (r.person.name || r.person.email) : (r.who ? "?" : "public"), person: undefined })) });
  } catch (e) { return bad(res, e.message, 500); }
}
