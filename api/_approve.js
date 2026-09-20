import { json, bad, db, require, audit, scoped, RANK } from "./_lib.js";
// POST {id, action: "approve"|"refuse"|"replace", reason?, day (YYYY-MM-DD local), band_no?}  event_staff+ (replace: event_admin+)
export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, "POST only", 405);
  try {
    const u = await require(req, res, "event_staff"); if (!u) return;
    const { id, action, reason, day, band_no } = req.body || {};
    const today = /^\d{4}-\d{2}-\d{2}$/.test(day || "") ? day : new Date(Date.now() + 10 * 3600e3).toISOString().slice(0, 10);
    const r = (await db(`sign_ons?id=eq.${id}&select=id,event_id,result,signed_at,flags,deleted_at,event:events(wristband_mode)`))[0];
    if (!r) return bad(res, "Record not found", 404);
    if (!scoped(u, r.event_id)) return bad(res, "Not your event", 403);
    if (r.deleted_at) return bad(res, "Record deleted");
    const mode = r.event && r.event.wristband_mode === "daily" ? "daily" : "event";
    const bands = await db(`wristbands?sign_on_id=eq.${id}&voided_at=is.null&select=id,day,band_no,kind,issued_at&order=issued_at`);
    const todays = mode === "daily" ? bands.filter(b => b.day === today) : bands;
    if (action === "approve") {
      if (!r.signed_at) return bad(res, "Waiver not signed — cannot approve");
      if (r.result === "refused") return bad(res, "Refused — clear the refusal first");
      if (todays.length) return json(res, 200, { ok: true, already: true, band: todays[0], mode });
      const band = (await db("wristbands", { method: "POST", body: { sign_on_id: id, event_id: r.event_id, day: today, band_no: band_no || null, kind: "initial", issued_by: u.id } }))[0];
      const patch = r.result === "signed" ? {} : { result: "signed", approved_at: new Date().toISOString(), approved_by: u.id, operator: u.name || u.email, refusal_reason: null };
      const out = Object.keys(patch).length ? await db(`sign_ons?id=eq.${id}`, { method: "PATCH", body: patch }) : [r];
      await audit(u.id, "approve", id, r.event_id, { day: today, band: band.id, band_no: band_no || null, mode });
      return json(res, 200, { ok: true, record: out[0], band, mode });
    }
    if (action === "replace") {
      if (RANK[u.role] < RANK.event_admin) return bad(res, "Only an event admin can replace a wristband", 403);
      if (!reason) return bad(res, "Reason required");
      const old = todays[0] || null;
      if (old) await db(`wristbands?id=eq.${old.id}`, { method: "PATCH", body: { voided_at: new Date().toISOString() }, prefer: "return=minimal" });
      const band = (await db("wristbands", { method: "POST", body: { sign_on_id: id, event_id: r.event_id, day: today, band_no: band_no || null, kind: "replacement", reason, replaces: old ? old.id : null, issued_by: u.id } }))[0];
      await audit(u.id, "wristband_replaced", id, r.event_id, { day: today, reason, old_band: old ? old.id : null, old_band_no: old ? old.band_no : null, new_band: band.id, band_no: band_no || null });
      return json(res, 200, { ok: true, band, mode });
    }
    if (action === "refuse") {
      const out = await db(`sign_ons?id=eq.${id}`, { method: "PATCH", body: { result: "refused", approved_at: new Date().toISOString(), approved_by: u.id, operator: u.name || u.email, refusal_reason: reason || "Refused at gate" } });
      await audit(u.id, "refuse", id, r.event_id, { reason });
      return json(res, 200, { ok: true, record: out[0] });
    }
    return bad(res, "action must be approve or refuse");
  } catch (e) { return bad(res, e.message, 500); }
}
