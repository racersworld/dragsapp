import { json } from "./_lib.js";
export default async function handler(req, res) {
  return json(res, 200, { ok: true, supabaseUrl: process.env.SUPABASE_URL || "", anonKey: process.env.SUPABASE_ANON_KEY || "", ocr: !!process.env.ANTHROPIC_API_KEY, ocrOwner: process.env.OCR_KEY_OWNER || "" });
}
