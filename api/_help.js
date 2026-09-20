import { json, bad, db, require, scoped, audit } from "./_lib.js";
// Help requests from the gate.
// GET ?event=<id>          event_staff+: open requests for the event (staff see their own; event_admin+ see all)
// POST {event_id, sign_on_id?, reason, note?, device}    event_staff+: raise
// PATCH {id, action: "ack"|"resolve"}    event_admin+
export default async function handler(req, res) {
  try {
    const u = await require(req, res, "event_staff"); if (!u) return;
    const q = req.query || {}, b = req.body || {};
    if (req.method === "GET") {
      if (!q.event) return bad(res, "event required"); if (!scoped(u, q.event)) return bad(res, "Not your event", 403);
      let f = `event_id=eq.${q.event}&resolved_at=is.null`;
      if (u.role === "event_staff") f += `&raised_by=eq.${u.id}`;
      const rows = await db(`help_requests?${f}&select=*,raiser:profiles!help_requests_raised_by_fkey(name,email),acker:profiles!help_requests_acked_by_fkey(name,email)&order=created_at.desc`);
      return json(res, 200, { ok: true, requests: rows.map(r => ({ ...r, raised_name: r.raiser ? (r.raiser.name || r.raiser.email) : "", acked_name: r.acker ? (r.acker.name || r.acker.email) : "", raiser: undefined, acker: undefined })) });
    }
    if (req.method === "POST") {
      if (!b.event_id || !b.reason) return bad(res, "event_id and reason required"); if (!scoped(u, b.event_id)) return bad(res, "Not your event", 403);
      const lat = typeof b.lat === "number" ? b.lat : null, lng = typeof b.lng === "number" ? b.lng : null;
      const out = await db("help_requests", { method: "POST", body: { event_id: b.event_id, sign_on_id: b.sign_on_id || null, person: b.person || null, reason: String(b.reason).slice(0, 80), note: b.note ? String(b.note).slice(0, 300) : null, device: b.device || null, station: b.station ? String(b.station).slice(0, 60) : null, lat, lng, accuracy: b.accuracy ? Math.round(b.accuracy) : null, raised_by: u.id } });
      await audit(u.id, "help_requested", b.sign_on_id || null, b.event_id, { reason: b.reason, device: b.device, station: b.station || null, lat, lng });
      return json(res, 200, { ok: true, request: out[0] });
    }
    if (req.method === "PATCH") {
      const ua = await require(req, res, "event_admin"); if (!ua) return;
      const r = (await db(`help_requests?id=eq.${b.id}&select=*`))[0]; if (!r) return bad(res, "Not found", 404);
      if (!scoped(ua, r.event_id)) return bad(res, "Not your event", 403);
      const patch = b.action === "resolve" ? { resolved_at: new Date().toISOString(), resolved_by: ua.id } : { acked_at: r.acked_at || new Date().toISOString(), acked_by: r.acked_by || ua.id };
      const out = await db(`help_requests?id=eq.${b.id}`, { method: "PATCH", body: patch });
      await audit(ua.id, b.action === "resolve" ? "help_resolved" : "help_acknowledged", r.sign_on_id, r.event_id, { request: r.id, minutes: Math.round((Date.now() - new Date(r.created_at)) / 60000) });
      return json(res, 200, { ok: true, request: out[0] });
    }
    return bad(res, "Method", 405);
  } catch (e) { return bad(res, e.message, 500); }
}
