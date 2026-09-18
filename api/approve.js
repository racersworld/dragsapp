import { json, bad, db, require, audit, scoped } from "./_lib.js";
// POST {id, action: "approve"|"refuse", reason?}  staff+
export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, "POST only", 405);
  try {
    const u = await require(req, res, "event_staff"); if (!u) return;
    const { id, action, reason } = req.body || {};
    const r = (await db(`sign_ons?id=eq.${id}&select=id,event_id,result,signed_at,flags`))[0];
    if (!r) return bad(res, "Record not found", 404);
    if (!scoped(u, r.event_id)) return bad(res, "Not your event", 403);
    if (action === "approve") {
      if (!r.signed_at) return bad(res, "Waiver not signed — cannot approve");
      if (r.result === "signed") return json(res, 200, { ok: true, already: true, record: r });
      const out = await db(`sign_ons?id=eq.${id}`, { method: "PATCH", body: { result: "signed", approved_at: new Date().toISOString(), approved_by: u.id, operator: u.name || u.email, refusal_reason: null } });
      await audit(u.id, "approve", id, r.event_id, {});
      return json(res, 200, { ok: true, record: out[0] });
    }
    if (action === "refuse") {
      const out = await db(`sign_ons?id=eq.${id}`, { method: "PATCH", body: { result: "refused", approved_at: new Date().toISOString(), approved_by: u.id, operator: u.name || u.email, refusal_reason: reason || "Refused at gate" } });
      await audit(u.id, "refuse", id, r.event_id, { reason });
      return json(res, 200, { ok: true, record: out[0] });
    }
    return bad(res, "action must be approve or refuse");
  } catch (e) { return bad(res, e.message, 500); }
}
