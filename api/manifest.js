import { json, bad, db, require, signUrl, scoped, RANK } from "./_lib.js";
// GET ?event=<id>&since=<iso>  staff+: pending + signed records for offline approval, with photo URLs (1h)
export default async function handler(req, res) {
  try {
    const u = await require(req, res, "event_staff"); if (!u) return;
    const q = req.query || {};
    if (!q.event) return bad(res, "event required");
    if (!scoped(u, q.event)) return bad(res, "Not your event", 403);
    let f = `event_id=eq.${q.event}`;
    if (q.since) f += `&updated_at=gte.${encodeURIComponent(q.since)}`;
    const rows = await db(`sign_ons?${f}&select=id,type,source,first_name,last_name,dob,licence_number,state,class,expiry,flags,result,refusal_reason,signed_at,approved_at,guardian_name,phone,qr_token,photo,licence_img,updated_at&order=updated_at.desc&limit=5000`);
    const out = [];
    for (const r of rows) out.push({ ...r, photo_url: await signUrl(r.photo, 7200), licence_img_url: await signUrl(r.licence_img, 7200) });
    return json(res, 200, { ok: true, records: out, at: new Date().toISOString() });
  } catch (e) { return bad(res, e.message, 500); }
}
