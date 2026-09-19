import { json, bad, db } from "./_lib.js";
const URL_ = () => (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SVC = () => process.env.SUPABASE_SERVICE_KEY || "";
// One-time: creates the first super_admin. Only works while the profiles table is empty and BOOTSTRAP_SECRET matches.
// POST {secret, email, password, name}
export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, "POST only", 405);
  try {
    const b = req.body || {};
    if (!process.env.BOOTSTRAP_SECRET || b.secret !== process.env.BOOTSTRAP_SECRET) return bad(res, "Not allowed", 403);
    const existing = await db("profiles?select=id&limit=1");
    if (existing.length) return bad(res, "Already set up — remove BOOTSTRAP_SECRET from Vercel", 409);
    if (!b.email || !b.password || b.password.length < 8) return bad(res, "email and password (8+) required");
    const r = await fetch(`${URL_()}/auth/v1/admin/users`, { method: "POST", headers: { apikey: SVC(), Authorization: `Bearer ${SVC()}`, "Content-Type": "application/json" }, body: JSON.stringify({ email: b.email, password: b.password, email_confirm: true }) });
    const au = await r.json(); if (!r.ok) throw new Error(au.msg || au.message || "auth error");
    const p = await db("profiles", { method: "POST", body: { id: au.id, email: b.email, name: b.name || "Super admin", role: "god" } });
    return json(res, 200, { ok: true, user: p[0], note: "Now delete BOOTSTRAP_SECRET from Vercel and redeploy." });
  } catch (e) { return bad(res, e.message, 500); }
}
