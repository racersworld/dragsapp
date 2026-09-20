import { json, bad, db, require, signUrl, scoped, RANK, audit } from "./_lib.js";
const EDITABLE = ["first_name","last_name","dob","licence_number","state","class","expiry","address","phone","email","guardian_name","guardian_phone","type"];
// GET ?event=<id>&q=<search>&mine=1&since=<iso>   staff: own records today (or mine=1); admin+: all for event
// GET ?qr=<token> or ?id=<id>                    one record with signed image URLs (staff+)
export default async function handler(req, res) {
  try {
    const u = await require(req, res, "event_staff"); if (!u) return;
    const q = req.query || {};
    if (req.method === "PATCH" || req.method === "DELETE") {
      if (RANK[u.role] < RANK.event_admin) return bad(res, "Not allowed", 403);
      const b = req.body || {}; const id = b.id || q.id; if (!id) return bad(res, "id required");
      const r = (await db(`sign_ons?id=eq.${id}&select=*`))[0]; if (!r) return bad(res, "Not found", 404);
      if (!scoped(u, r.event_id)) return bad(res, "Not your event", 403);
      if (req.method === "DELETE") {
        if (r.deleted_at) return bad(res, "Already deleted");
        await db(`sign_ons?id=eq.${id}`, { method: "PATCH", body: { deleted_at: new Date().toISOString(), deleted_by: u.id, delete_reason: b.reason || null } });
        await audit(u.id, "delete", id, r.event_id, { reason: b.reason || null, name: `${r.first_name} ${r.last_name}`, licence_number: r.licence_number, result: r.result });
        return json(res, 200, { ok: true });
      }
      const before = {}, after = {};
      for (const k of EDITABLE) if (b[k] !== undefined && String(b[k] ?? "") !== String(r[k] ?? "")) { before[k] = r[k]; after[k] = b[k] === "" ? null : b[k]; }
      if (!Object.keys(after).length) return json(res, 200, { ok: true, unchanged: true });
      if (after.first_name) after.first_name = String(after.first_name).toUpperCase(); if (after.last_name) after.last_name = String(after.last_name).toUpperCase();
      const out = await db(`sign_ons?id=eq.${id}`, { method: "PATCH", body: { ...after, amended_at: new Date().toISOString(), amended_by: u.id } });
      await audit(u.id, "edit", id, r.event_id, { before, after, reason: b.reason || null });
      return json(res, 200, { ok: true, record: out[0] });
    }
    const withUrls = async r => ({ ...r, licence_img_url: await signUrl(r.licence_img), licence_back_url: await signUrl(r.licence_back), licence_photo_url: await signUrl(r.licence_photo), guardian_licence_url: await signUrl(r.guardian_licence_img), photo_url: await signUrl(r.photo), sig_url: await signUrl(r.sig), guardian_sig_url: await signUrl(r.guardian_sig) });
    if (q.qr || q.id) {
      const r = (await db(`sign_ons?${q.qr ? "qr_token=eq." + encodeURIComponent(q.qr) : "id=eq." + encodeURIComponent(q.id)}&select=*`))[0];
      if (!r) return bad(res, "Not found", 404);
      if (!scoped(u, r.event_id)) return bad(res, "Not your event", 403);
      if (r.deleted_at && RANK[u.role] < RANK.admin) return bad(res, "Not found", 404);
      const names = await db(`profiles?id=in.(${[r.approved_by, r.amended_by, r.deleted_by, r.created_by].filter(Boolean).join(",") || "00000000-0000-0000-0000-000000000000"})&select=id,name,email`);
      const nm = id => { const p = names.find(x => x.id === id); return p ? (p.name || p.email) : null; };
      return json(res, 200, { ok: true, record: { ...(await withUrls(r)), approved_by_name: nm(r.approved_by), amended_by_name: nm(r.amended_by), deleted_by_name: nm(r.deleted_by), created_by_name: nm(r.created_by) } });
    }
    if (!q.event) return bad(res, "event required");
    if (!scoped(u, q.event)) return bad(res, "Not your event", 403);
    let f = `event_id=eq.${q.event}`;
    if (q.deleted && RANK[u.role] >= RANK.admin) f += `&deleted_at=not.is.null`; else f += `&deleted_at=is.null`;
    if (u.role === "event_staff" || q.mine) f += `&or=(created_by.eq.${u.id},approved_by.eq.${u.id})`;
    if (q.since) f += `&updated_at=gte.${encodeURIComponent(q.since)}`;
    if (q.q) { const s = encodeURIComponent(`%${q.q}%`); f += `&and=(or(first_name.ilike.${s},last_name.ilike.${s},licence_number.ilike.${s}))`; }
    const rows = await db(`sign_ons?${f}&select=id,event_id,type,source,first_name,last_name,dob,licence_number,state,class,expiry,address,phone,email,guardian_name,guardian_phone,flags,result,refusal_reason,signed_at,approved_at,approved_by,created_by,operator,device,waiver_version,qr_token,photo,licence_img,licence_back,created_at,updated_at,amended_at,deleted_at,delete_reason&order=created_at.desc&limit=${Math.min(+q.limit || 500, 5000)}`);
    return json(res, 200, { ok: true, records: rows });
  } catch (e) { return bad(res, e.message, 500); }
}
