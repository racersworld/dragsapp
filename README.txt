Racelicence.com — v3 (21 Sep 2026)

UPLOAD TO GITHUB (racersworld/dragsapp), replacing what's there:
  index.html, training.html, logo.png, logo-dark.png, logo.svg, mark.svg,
  icon-192.png, icon-512.png, favicon.png, manifest.json, .vercelignore
  and the whole api/ folder ([...route].js, _lib.js, _approve.js, _assign.js, _audit.js, _bootstrap.js,
  _config.js, _events.js, _help.js, _image.js, _invites.js, _manifest.js, _ocr.js, _records.js,
  _submit.js, _users.js)

DATABASE: supabase.sql is cumulative. Everything up to today has already been run in the Sydney project.
  If you ever set up a fresh project, run the whole file once.

VERCEL env vars in use: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY,
  OCR_KEY_OWNER, (BOOTSTRAP_SECRET only for first-time setup — delete after).

Old api/*.js files without the underscore may still exist in the repo; .vercelignore stops them deploying.
