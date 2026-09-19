import { bad, require, signUrl } from "./_lib.js";
// GET ?path=<storage path>  staff+ -> 302 to a short-lived signed URL
export default async function handler(req, res) {
  const u = await require(req, res, "event_staff"); if (!u) return;
  const p = (req.query || {}).path || "";
  if (!/^[0-9a-f-]{36}\/[A-Z0-9-]+\/[a-z_]+\.(jpg|png)$/i.test(p)) return bad(res, "bad path");
  const url = await signUrl(p, 600);
  if (!url) return bad(res, "not found", 404);
  res.setHeader("Cache-Control", "private, max-age=300");
  res.redirect(302, url);
}
