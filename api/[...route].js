// Single entry point for the whole API (Vercel Hobby allows 12 functions; this is one).
// /api/<name> -> handlers in _<name>.js. Files starting with _ are not deployed as functions.
import approve from "./_approve.js";
import assign from "./_assign.js";
import audit from "./_audit.js";
import bootstrap from "./_bootstrap.js";
import config from "./_config.js";
import events from "./_events.js";
import image from "./_image.js";
import invites from "./_invites.js";
import manifest from "./_manifest.js";
import ocr from "./_ocr.js";
import records from "./_records.js";
import submit from "./_submit.js";
import users from "./_users.js";
const ROUTES = { approve, assign, audit, bootstrap, config, events, image, invites, manifest, ocr, records, submit, users };
export default async function handler(req, res) {
  const r = req.query && req.query.route;
  const name = Array.isArray(r) ? r[0] : (r || String(req.url || "").split("?")[0].split("/").filter(Boolean).pop());
  const fn = ROUTES[name];
  if (!fn) { res.setHeader("Cache-Control", "no-store"); return res.status(404).json({ ok: false, error: "No such endpoint: " + name }); }
  if (req.query) delete req.query.route;
  return fn(req, res);
}
