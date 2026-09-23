# jobRUN

Job flow engine for PINCH — Next.js on Vercel · Supabase · Mapbox · Claude (Rosie).
The full developer handoff is in [`docs/INTEGRATION.md`](docs/INTEGRATION.md); the product rules are in
`docs/jobRUN_PINCH_Product_Document_Beta_0.1.docx`. The working prototype — the functional spec — is served at
[`/prototype.html`](public/prototype.html) when the app runs.

## Quick start

```bash
pnpm install
cp .env.example .env.local   # NEXT_PUBLIC_SIMULATE=true works with no other keys
pnpm dev                     # http://localhost:3000
```

With `NEXT_PUBLIC_SIMULATE=true` the board runs on simulated jobs over PINCH's real property list, like the prototype.

## Database

1. Create a Supabase project and run both files in `supabase/migrations/` in order
   (SQL editor, or `supabase db push` after `supabase link`).
   - `…000000_initial_schema.sql` is the handoff `schema.sql`, unchanged.
   - `…000100_import_and_security.sql` adds import keys, supervisor fields, a lat/lng → `geom` trigger, and RLS on every table.
2. Fill `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
3. Import and geocode:

```bash
pnpm import:data --dry-run   # report only
pnpm import:data             # customers, properties, contacts (re-runnable)
pnpm geocode --limit 20      # sample Mapbox geocoding first
pnpm geocode                 # the rest
```

The import reads the PINCH CSV (`data/properties_list.csv`) as the source of truth, drops the QA/test companies
(`--include-test` keeps them), collapses duplicate rows, and takes ZIP-centroid coordinates from `data/properties.json`.

Still needed from PINCH before going live: the cleaning-team (Pro) list for `cleaning_teams` and `properties.default_team_id`, and the operators list.

## Layout

| Path | What |
|---|---|
| `lib/config.ts` | `CONFIG` switches, same as the prototype |
| `lib/domain/` | Job/property types and the ported pure functions (`health`, `thresholdFor`, `isBad`, `incKind`, sort orders, `isBizHours`) |
| `lib/adapters/` | `loadProperties` / `loadJobs` with simulated and Supabase implementations |
| `lib/supabase/` | browser, server (operator session) and admin (service role) clients |
| `lib/rosie.ts`, `app/api/rosie` | Rosie prompts and board snapshot built server-side; streams plain text |
| `app/api/in/*`, `app/api/out/*` | Integration routes — stubs returning 501 until each contract is confirmed |
| `app/api/cron/automated-messages` | Minute cron for confirmation / check-in texts (`vercel.json`; needs Vercel Pro) |
| `components/Board.tsx` | First cut of the five-lane board |

## Porting status (INTEGRATION.md §11)

- [x] Next.js app, env vars, schema, import + geocoding scripts
- [x] Health/threshold logic ported; five lanes with prototype sort orders and card states
- [x] `/api/rosie` server-side with the Anthropic key; webhook and cron routes scaffolded
- [ ] Port the rest of the board (icons, live ticking, paid row), then modal → filters/rail → map → Rosie UI
- [ ] Mapbox GL base, 3D buildings, TomTom traffic, OpenWeather
- [ ] Operator auth (Supabase Auth) and Realtime subscriptions
- [ ] Each integration, flipping out of simulation as it lands
