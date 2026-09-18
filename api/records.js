import { json, bad, db, require, signUrl, scoped, RANK } from "./_lib.js";
// GET ?event=<id>&q=<search>&mine=1&since=<iso>   staff: own records today (or mine=1); admin+: all for event
// GET ?qr=<token> or ?id=<id>                    one record with signed image URLs (staff+)
export default async function handler(req, res) {
  try {
    const u = await require(req, res, "event_staff"); if (!u) return;
    const q = req.query || {};
    const withUrls = async r => ({ ...r, licence_img_url: await signUrl(r.licence_img), licence_back_url: await signUrl(r.licence_back), photo_url: await signUrl(r.photo), sig_url: await signUrl(r.sig), guardian_sig_url: await signUrl(r.guardian_sig) });
    if (q.qr || q.id) {
      const r = (await db(`sign_ons?${q.qr ? "qr_token=eq." + encodeURIComponent(q.qr) : "id=eq." + encodeURIComponent(q.id)}&select=*`))[0];
      if (!r) return bad(res, "Not found", 404);
      if (!scoped(u, r.event_id)) return bad(res, "Not your event", 403);
      return json(res, 200, { ok: true, record: await withUrls(r) });
    }
    if (!q.event) return bad(res, "event required");
    if (!scoped(u, q.event)) return bad(res, "Not your event", 403);
    let f = `event_id=eq.${q.event}`;
    if (RANK[u.role] < RANK.admin || q.mine) f += `&created_by=eq.${u.id}`;
    if (q.since) f += `&updated_at=gte.${encodeURIComponent(q.since)}`;
    if (q.q) { const s = encodeURIComponent(`%${q.q}%`); f += `&or=(first_name.ilike.${s},last_name.ilike.${s},licence_number.ilike.${s})`; }
    const rows = await db(`sign_ons?${f}&select=id,event_id,type,source,first_name,last_name,dob,licence_number,state,class,expiry,address,phone,email,guardian_name,guardian_phone,flags,result,refusal_reason,signed_at,approved_at,approved_by,created_by,operator,device,waiver_version,qr_token,photo,licence_img,licence_back,created_at,updated_at&order=created_at.desc&limit=${Math.min(+q.limit || 500, 5000)}`);
    return json(res, 200, { ok: true, records: rows });
  } catch (e) { return bad(res, e.message, 500); }
}
