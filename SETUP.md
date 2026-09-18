# RACERS Sign-On v2 — setup

## 1. Supabase
1. Create a project (or use the racers.world one). Settings → API: copy **Project URL**, **anon public** key, **service_role** key.
2. SQL Editor → paste `supabase.sql` → Run.

## 2. Vercel environment variables (dragsapp → Settings → Environment Variables, all environments)
- `SUPABASE_URL` = Project URL
- `SUPABASE_ANON_KEY` = anon public key
- `SUPABASE_SERVICE_KEY` = service_role key (secret — server only)
- `ANTHROPIC_API_KEY` (already set), `OCR_KEY_OWNER` (already set)
- `BOOTSTRAP_SECRET` = any long random string (temporary, see step 4)

## 3. GitHub
Replace the repo contents with this folder: `index.html`, `logo.png`, `icon-*.png`, `favicon.png`, `manifest.json`, and the `api/` folder (ocr.js updated, plus _lib.js, config.js, events.js, submit.js, approve.js, records.js, manifest.js, image.js, users.js, bootstrap.js). Commit → Vercel redeploys.

## 4. Create the super admin (once)
In a browser console on the site, or with curl:
    fetch("/api/bootstrap",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({secret:"<BOOTSTRAP_SECRET>",email:"you@…",password:"<8+ chars>",name:"Adam"})}).then(r=>r.json()).then(console.log)
Then delete `BOOTSTRAP_SECRET` from Vercel and redeploy. The endpoint refuses once any user exists anyway.

## 5. In the app
Log in → Admin → Events → create the event (code e.g. LAKE27, waiver text, ages) → Admin → Users → create JT, Gloria (admin) and gate staff (staff).

## Links
- Staff: https://racelicence.com/
- Self sign-on: https://racelicence.com/?e=LAKE27
- Kiosk (iPad, Guided Access): https://racelicence.com/?kiosk=LAKE27
