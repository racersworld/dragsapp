import { json, bad, db, user, putImage, audit, eventByCode, token, scoped, RANK } from "./_lib.js";
// POST a sign-on record (gate, self or kiosk). Images arrive as data URLs and go to storage.
// gate (logged-in staff): result = signed immediately, approved_by = staff.
// self / kiosk (no login): result = pending until a gate scan approves it. Needs a valid open event code.
export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, "POST only", 405);
  try {
    const b = req.body || {};
    const u = await user(req);
    const source = ["gate", "self", "kiosk"].includes(b.source) ? b.source : (u ? "gate" : "self");
    if (source === "gate" && !u) return bad(res, "Login required", 401);
    const ev = b.event_id ? (await db(`events?id=eq.${b.event_id}&select=*`))[0] : await eventByCode(b.event_code);
    if (!ev) return bad(res, "Unknown event", 404);
    if (ev.status !== "open" && !u) return bad(res, "Event not open", 403);
    if (u && !scoped(u, ev.id)) return bad(res, "Not your event", 403);
    if (!b.id || !b.first_name || !b.last_name) return bad(res, "id, first_name, last_name required");
    const id = String(b.id).replace(/[^A-Z0-9\-]/gi, "").slice(0, 40);
    const existing = (await db(`sign_ons?id=eq.${id}&select=id,qr_token,result,created_by,source`))[0];
    if (existing) {
      const isAdmin = u && RANK[u.role] >= RANK.admin;
      const owner = u ? existing.created_by === u.id : (existing.created_by == null && existing.result === "pending");
      if (!isAdmin && !owner) return bad(res, "Record already exists", 409);
    }
    const qr = existing ? existing.qr_token : token();
    const dir = `${ev.id}/${id}`;
    const paths = {};
    for (const k of ["licence_img", "licence_back", "licence_photo", "photo", "sig", "guardian_sig", "guardian_licence_img"]) {
      if (b[k] && b[k].startsWith("data:")) paths[k] = await putImage(`${dir}/${k}.${b[k].startsWith("data:image/png") ? "png" : "jpg"}`, b[k]);
      else if (existing && b[k] == null) {/* keep */}
    }
    const isGate = source === "gate" && u;
    const row = {
      id, event_id: ev.id, type: b.type === "passenger" ? "passenger" : "driver", source,
      first_name: String(b.first_name).toUpperCase().slice(0, 80), last_name: String(b.last_name).toUpperCase().slice(0, 80),
      dob: b.dob || null, licence_number: b.licence_number || null, state: b.state || null, class: b.class || null, expiry: b.expiry || null, address: b.address || null,
      phone: b.phone || null, email: b.email || null, guardian_name: b.guardian_name || null, guardian_phone: b.guardian_phone || null,
      flags: Array.isArray(b.flags) ? b.flags : [],
      result: isGate ? (b.result === "refused" ? "refused" : "signed") : (existing && existing.result !== "pending" ? existing.result : "pending"),
      refusal_reason: b.refusal_reason || null,
      signed_at: b.signed_at || null,
      approved_at: isGate && b.result !== "refused" ? new Date().toISOString() : null, approved_by: isGate ? u.id : null,
      created_by: u ? u.id : null, operator: u ? u.name || u.email : (b.operator || source), device: b.device || null,
      waiver_version: b.waiver_version || ev.waiver_version, waiver_text: b.waiver_text || ev.waiver_text,
      ocr_source: b.ocr_source || null, ocr_text: b.ocr_text || null, qr_token: qr, no_licence: !!b.no_licence, photo_consent: b.photo_consent == null ? null : !!b.photo_consent, ...paths
    };
    const out = existing ? await db(`sign_ons?id=eq.${id}`, { method: "PATCH", body: row }) : await db("sign_ons", { method: "POST", body: row });
    await audit(u ? u.id : null, existing ? "update" : "create", id, ev.id, { source, result: row.result });
    return json(res, 200, { ok: true, id, qr_token: qr, result: row.result, event: { code: ev.code, name: ev.name } });
  } catch (e) { return bad(res, e.message, 500); }
}
