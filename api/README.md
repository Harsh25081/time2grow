# time2grow Python Poster Agent

This FastAPI service replaces the local n8n Poster Studio workflow. It keeps the
existing `poster_set` request/response contract used by the React page.

Required server environment variables:

- `OPENAI_API_KEY`
- `SUPABASE_URL` (falls back to `VITE_SUPABASE_URL`)
- `SUPABASE_ANON_KEY` (falls back to `VITE_SUPABASE_ANON_KEY`)

Optional variables:

- `POSTER_TEXT_MODEL` (default `gpt-4o-mini`)
- `POSTER_IMAGE_MODEL` (default `gpt-image-2`)
- `POSTER_IMAGE_QUALITY` (default `high`)
- `POSTER_ALLOWED_ORIGINS`
- `POSTER_REQUIRE_AUTH` (default `true`); disabling it also requires `POSTER_ALLOW_INSECURE_LOCAL=true` and is never allowed on Vercel
- `POSTER_MAX_CONCEPTS` (default `4`)

Local start:

```powershell
python -m pip install -r requirements.txt
python -m uvicorn api.poster:app --host 127.0.0.1 --port 8000
```

Health check: `GET http://127.0.0.1:8000/api/poster`.

Vercel detects `api/poster.py` as a Python Function. Provider keys remain on the
server and are never exposed through `VITE_*` browser variables.

Apply all Supabase migrations before deploying this service. Poster requests
fail closed unless the reserve_poster_generation authorization and quota RPC
is available. The RPC requires an active owner, admin, or editor membership,
limits burst usage, and reserves daily AI usage before provider calls.