// RACERS Sign-On — licence reader endpoint.
// POST { image: "data:image/jpeg;base64,..." }  ->  { ok, fields, raw }
// GET                                          ->  { ok, configured, owner }
// The Anthropic key lives in Vercel env (ANTHROPIC_API_KEY) and never reaches the browser.

const MODEL = "claude-sonnet-4-6";

const PROMPT = `You are reading a photo of an Australian driver licence (physical card or a digital licence shown on a phone screen). Extract the fields and reply with ONLY a JSON object, no prose, no markdown:
{
 "first": "given name(s) in UPPERCASE or empty string",
 "last": "family name in UPPERCASE or empty string",
 "dob": "YYYY-MM-DD or empty string",
 "expiry": "YYYY-MM-DD or empty string",
 "number": "licence number exactly as printed, no spaces, or empty string",
 "state": "one of QLD NSW VIC SA WA TAS ACT NT or empty string",
 "cls": "licence class/type as printed e.g. C, CA, P1, P2, L, R, or empty string",
 "address": "residential address on one line as printed, or empty string",
 "digital": true or false (true if this is a digital licence on a screen),
 "confidence": "high" | "medium" | "low",
 "notes": "anything an official should check, e.g. glare over expiry, or empty string"
}
Rules: if a field is not legible leave it empty rather than guessing. Dates on Australian licences are day-first. Do not include any text outside the JSON.`;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const key = process.env.ANTHROPIC_API_KEY;
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, configured: !!key, owner: process.env.OCR_KEY_OWNER || (key ? "unlabelled key" : "not set") });
  }
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  if (!key) return res.status(503).json({ ok: false, error: "ANTHROPIC_API_KEY not set in Vercel" });

  let image = (req.body && req.body.image) || "";
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(image);
  if (!m) return res.status(400).json({ ok: false, error: "image must be a base64 data URL (jpeg/png/webp)" });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 600,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
          { type: "text", text: PROMPT }
        ]}]
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ ok: false, error: (data.error && data.error.message) || "Anthropic error" });
    const text = (data.content || []).map(c => c.text || "").join("\n");
    const clean = text.replace(/```json|```/g, "").trim();
    let fields;
    try { fields = JSON.parse(clean); } catch { return res.status(502).json({ ok: false, error: "Reader returned unparseable output", raw: text }); }
    return res.status(200).json({ ok: true, fields, raw: text });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e && e.message || e) });
  }
}
