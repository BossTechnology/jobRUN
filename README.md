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

## Live mode (real data)

1. Supabase → Authentication → Users → **Add user** for each operator (email + password; there is no self sign-up).
   Magic links also work once `https://<your-domain>/auth/callback` is in Authentication → URL Configuration → Redirect URLs.
2. Insert each operator into `operators` (`name`, `email`, `active = true`). The first sign-in links the row to the Auth user.
   Only active operators can read or write anything (RLS via `private.is_operator()`).
3. Set `NEXT_PUBLIC_SIMULATE=false` (locally in `.env.local`, in Vercel for Production) and redeploy.

In live mode the board loads from Supabase, follows Realtime changes, and every action is saved through
`/api/board/sync` (jobs, messages, actions, add-ons, stage/assignment events, cancellations; Zendesk mirror when configured).

## Integrations

| Piece | Status |
|---|---|
| Map base, 3D buildings | MapLibre GL + OpenFreeMap tiles (free, no key) |
| Traffic / weather | TomTom / OpenWeather via `/api/map/*` when keys are set; simulated otherwise |
| Rosie | `/api/rosie`, needs `ANTHROPIC_API_KEY` |
| Geocoding | US Census batch geocoder (`pnpm geocode`); Mapbox optional |
| Cron texts (1-hour confirmation, check-in nudge) | Implemented; delivered via Twilio when `TWILIO_*` is set, logged either way |
| Twilio inbound SMS | Implemented with signature check (`/api/in/twilio`) |
| Zendesk mirror | Implemented (`ZENDESK_*`) |
| Gmail, TrueDialog, TracWork, QuickBooks, Work App | Stubs (501) — need PINCH's accounts and API details (product doc §10) |

## Layout

| Path | What |
|---|---|
| `lib/config.ts` | `CONFIG` switches, same as the prototype |
| `app/prototype.css` | The prototype's styles, copied verbatim (only font variables changed) |
| `lib/domain/` | Job/property types, ET date helpers and the ported pure functions (`health`, `thresholdFor`, `isBad`, `incKind`, `priceOf`, sort orders) |
| `lib/i18n/` | English/Spanish UI strings, generated from the prototype |
| `lib/sim/` | Browser-side simulation (PINCH world + seeded jobs), used while `NEXT_PUBLIC_SIMULATE=true` |
| `lib/board/` | Client job store, board context and the ported job actions |
| `lib/adapters/` | `loadBoard()` from Supabase for live mode |
| `components/jobrun/` | Board, job modal (Pending/Scheduled and In Progress/Complete/Validation), actions footer, job report |
| `lib/supabase/` | browser, server (operator session) and admin (service role) clients |
| `lib/rosie.ts`, `app/api/rosie` | Rosie prompts and board snapshot built server-side; streams plain text |
| `app/api/in/*`, `app/api/out/*` | Integration routes — stubs returning 501 until each contract is confirmed |
| `app/api/cron/automated-messages` | Minute cron for confirmation / check-in texts (`vercel.json`; needs Vercel Pro) |

## Porting status (INTEGRATION.md §11)

- [x] Next.js app, env vars, schema, import + geocoding scripts
- [x] Board: five lanes, card states, clocks, paid row, simulation tick (payments, follow-ups, new requests, auto-confirm)
- [x] Job modal: Pending (AI sender, AI/You fields, window, cleaner availability, gates), Scheduled edit, Stage tabs (details, Job Tracker with photos, billing/audit), Actions with reasons, add-ons, approve/reject, job report
- [x] `/api/rosie` server-side with the Anthropic key; webhook and cron routes scaffolded
- [x] Header: timeframe with custom range, live ET clock, Alerts/Alarms/Anomalies/Actions intelligence, operator switcher, config sidebar (logo, language)
- [x] Rail + filters: Observe (health, customers/properties/teams/operators/services/stages/keywords), Geo (city/ZIP/state, radius, property type), focus chip, Incidents and Activity feeds, job location map
- [x] Map mode (MapLibre): clusters, pins, list, incidents, tour, 3D buildings, traffic, weather, payout orb
- [x] Rosie UI: modes, scope, insight card, chat, voice in/out
- [x] Operator auth, operator-only RLS, Realtime, persisted actions, cron texts, Twilio inbound, Zendesk mirror
- [ ] Gmail, TrueDialog, TracWork, QuickBooks, Work App — waiting on PINCH access
