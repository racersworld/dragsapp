import { json, bad, db, user, require, eventByCode, eventScoped } from "./_lib.js";
// GET ?code=X   -> public: one open event (no pin/waiver internals beyond what a form needs)
// GET           -> staff+: all events (admin sees all statuses, staff sees open)
// POST          -> admin+: create or update {id?, code, name, venue, starts, ends, status, passenger_min, guardian_under, waiver_version, waiver_text, kiosk_pin}
export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const q = req.query || {};
      if (q.code) {
        const e = await eventByCode(q.code);
        if (!e || e.status !== "open") return bad(res, "Event not open", 404);
        const { kiosk_pin, created_by, ...pub } = e;
        return json(res, 200, { ok: true, event: pub });
      }
      const u = await require(req, res, "event_staff"); if (!u) return;
      const rows = await db(`events?select=*&order=created_at.desc`);
      if (u.role === "event_staff") return json(res, 200, { ok: true, events: rows.filter(e => (u.events || []).includes(e.id) && e.status === "open").map(({ kiosk_pin, ...e }) => e) });
      if (u.role === "event_admin") return json(res, 200, { ok: true, events: rows.filter(e => (u.events || []).includes(e.id)) });
      return json(res, 200, { ok: true, events: rows });
    }
    if (req.method === "POST") {
      const u = await require(req, res, "event_admin"); if (!u) return;
      const b = req.body || {};
      if (eventScoped(u)) { if (!b.id || !(u.events || []).includes(b.id)) return bad(res, "You can only edit your own event", 403); const cur = (await db(`events?id=eq.${b.id}&select=code`))[0]; b.code = cur.code; }
      const row = { code: String(b.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12), name: b.name, venue: b.venue || "", starts: b.starts || null, ends: b.ends || null, status: b.status || "open", passenger_min: +b.passenger_min || 16, guardian_under: +b.guardian_under || 18, waiver_version: b.waiver_version || "v1", waiver_text: b.waiver_text || "", kiosk_pin: String(b.kiosk_pin || "2468") };
      if (!row.code || !row.name) return bad(res, "code and name required");
      let out;
      if (b.id) out = await db(`events?id=eq.${b.id}`, { method: "PATCH", body: row });
      else out = await db("events", { method: "POST", body: { ...row, created_by: u.id } });
      return json(res, 200, { ok: true, event: out[0] });
    }
    return bad(res, "Method", 405);
  } catch (e) { return bad(res, e.message, 500); }
}
