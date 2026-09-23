# jobRUN · Developer Handoff

**Product:** jobRUN for PINCH — a job flow engine that sits on top of PINCH's existing systems (Gmail, Zendesk, Work App, TracWork/Job Tracker, TrueDialog, Twilio, QuickBooks).
**Target stack:** Next.js on Vercel · Supabase (Postgres + Realtime + Storage) · Mapbox GL · Anthropic API (Rosie).
**Owner:** Federico (Boss.Technology).

---

## 1. What's in this package

| File | What it is |
|---|---|
| `jobrun-prototype.html` | The complete working prototype. One file: UI, styles, Leaflet, simulation, Rosie. **This is the spec.** Every behavior the product needs is implemented and visible here. |
| `INTEGRATION.md` | This document. |
| `schema.sql` | Supabase schema: customers, contacts, properties, cleaning_teams, operators, jobs, job_events, messages, job_actions, job_addons, evidence, tracker. |
| `properties.json` | PINCH's 1,528 properties with ZIP-level coordinates, ready to import. |
| `properties_list.csv` | The original PINCH export the JSON was built from. |
| `jobRUN_PINCH_Product_Document_Beta_0.1.docx` | Product document: the seven-stage model, rules, and open questions for PINCH. |

## 2. How to read the prototype

Open `jobrun-prototype.html` in a browser. Everything runs on simulated data (`CONFIG.SIMULATE = true` at the top of the main script). The parts to port are marked with section banners in the script:

- `PINCH WORLD` — data model (properties, customers, teams, jobs, thresholds, health)
- `BOARD` — the five-lane board and cards
- `PENDING MODAL` / `STAGE MODAL` / `ACTIONS` — the job modal at every stage
- `MAP MODE (Leaflet)` — map, clusters, pins, list, incidents, tour, traffic, weather, payout orb
- `ROSIE` — assistant modes, scope, insight card, chat, voice in/out
- `HEADER EVENT SIM` — alerts/alarms/anomalies/actions feeds
- `FILTERS` — Observe, Geo, health, operators, focus scope

The visual rules (card states, colors, thresholds, sort orders) are all in code and CSS; treat them as the source of truth.

**Recommended approach:** port to React components one section at a time, keeping the simulation running behind `CONFIG.SIMULATE` so the UI never goes blank while integrations land. Each adapter below has a simulated implementation in the prototype to copy the output shape from.

## 3. Environment variables (Vercel)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server only
NEXT_PUBLIC_MAPBOX_TOKEN=           # or MAPTILER_KEY / GOOGLE_MAPS_KEY
TOMTOM_TRAFFIC_KEY=                 # or GOOGLE_MAPS_KEY for traffic tiles
OPENWEATHER_KEY=
ANTHROPIC_API_KEY=                  # server only (Rosie)
MAPBOX_GEOCODING_TOKEN=             # import-time geocoding
GMAIL_WEBHOOK_SECRET=  TWILIO_AUTH_TOKEN=  TRUEDIALOG_KEY=  ZENDESK_TOKEN=  WORKAPP_KEY=  TRACWORK_KEY=  QUICKBOOKS_CLIENT_ID= / SECRET=
BUSINESS_TZ=America/New_York
```

## 4. Adapters — replace the simulation

Each function below exists conceptually in the prototype. Implement them against Supabase and swap `CONFIG.SIMULATE` to `false`.

| Adapter | Replaces (prototype) | Production source |
|---|---|---|
| `loadProperties()` | `REAL.props` → `PROPS` | `select * from properties` (geocoded lat/lng) |
| `loadJobs()` | `seedJobs()` / `JOBS` | `select * from jobs` + `jobs_unanswered` view |
| `subscribeJobs(cb)` | 5-second `tick()` | Supabase Realtime on `jobs`, `messages`, `job_events` |
| `sendMessage(job, channel, text)` | `sendMsg()` / `textTeam()` | API route → Gmail send (email) · TrueDialog (SMS to cleaners) · Zendesk comment (mirror) |
| `recordAction(job, action, reason)` | `doAct()` | insert into `job_actions` + `job_events`; Zendesk comment |
| `writeWorkApp(job)` | `logAction('workapp')` | Work App API (create/update job) |
| `loadTraffic(bounds)` | `TRAF` / `segLevel()` | TomTom Traffic Flow tiles or Google traffic layer |
| `loadWeather(states)` | `WX` / `driftWeather()` | OpenWeather current conditions per state centroid, 10-min cache |
| `askRosieServer(turns, snapshot)` | `SAMPLE(...)` (viewer's Claude) | `POST /api/rosie` → Anthropic Messages API |

Health, thresholds, sort orders, and card states are pure functions of job fields (`health()`, `thresholdFor()`, `isBad()`, `incKind()`) — port them unchanged.

## 5. Data import (one time)

1. Run `schema.sql` in the Supabase SQL editor.
2. Insert `customers` from the distinct `company_name` values in the CSV.
3. Insert `properties` from `properties.json` (fields map 1:1: `n`→name, `c`→customer index, `t`→type, `a`→address1, `ci`→city, `s`→state, `z`→postal_code, `la/lo`→lat/lng, `u`→units_count, `cl`→cleaners_count, `m`→manager_name, `p`→manager_phone, `e`→manager_email).
4. **Geocode properly:** the JSON has ZIP-centroid coordinates (good enough for clustering, not for street level). Run every address through Mapbox Geocoding once and overwrite `lat/lng`, then `update properties set geom = st_setsrid(st_makepoint(lng, lat), 4326)`.
5. Insert `contacts` from the manager columns (one per property, de-duplicated by email).
6. Insert `cleaning_teams` from PINCH's Pro list (not in this package) and set `properties.default_team_id`.
7. Insert `operators` (PINCH ops team; the prototype uses seven).

## 6. The map (the biggest visual change)

The prototype draws states, interstates, and generated street grids because it cannot load tiles. In production:

1. Replace the drawn base with **Mapbox GL** (`mapbox://styles/mapbox/light-v11` matches the prototype's palette) or MapTiler. Keep Leaflet + `mapbox-gl-leaflet`, or move to Mapbox GL directly — the marker, cluster, list, tour, and orb logic is independent of the base layer.
2. Turn on **3D buildings** (`fill-extrusion` layer from the `building` source) from zoom 15.
3. **Traffic:** add TomTom Flow tiles (`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=`) as an overlay toggled by the car button, or Google's traffic layer if using Google Maps.
4. **Weather:** OpenWeather `weather?lat&lon` per state centroid; keep the prototype's tint + chip rendering.
5. **Clustering:** the prototype clusters by state (< z6.2), city (< z9.5), then individual pins. With 1,528 properties this is fine client-side; if the count grows past ~10k, use Supercluster.
6. **Marker style:** copy `targetSVG()` and the `.jm-pin` / `.jm-cluster` CSS verbatim — these are the MetaMAP-matched visuals Federico approved.
7. **Tour:** `flyTo` with `duration: 2.6s`, 13 s per stop, worst-first order from `tourList()`. Narration via `speak()`.
8. **Payout orb:** `payoutOrb()` — draws on its own top-most renderer. Trigger from the QuickBooks "bill paid" webhook.

## 7. Realtime and events

- Subscribe to `jobs` (all changes), `messages` (inserts), `job_events` (inserts). On each change, re-run `health()` for the affected job and re-render its card/marker only.
- Header counters (Alerts/Alarms/Anomalies/Actions) derive from `job_events` + current job health; keep a rolling 6-hour window.
- Business hours: intake clocks (time-to-claim) count in `BUSINESS_TZ` 9–5; job-time clocks (window, check-in) run 24/7. See `isBizHours()`.

## 8. Webhooks (Vercel API routes)

| Route | Source | Writes |
|---|---|---|
| `/api/in/gmail` | Gmail push (Pub/Sub) on the shared inbox | new job in `pending` + `messages`; AI sender/field extraction → `ai_confidence`, `field_sources` |
| `/api/in/twilio` | Twilio inbound SMS / call log | `messages` (direction in) or new job |
| `/api/in/truedialog` | TrueDialog inbound (cleaner replies) | `messages`; sets `team_confirmed` on "confirmed" |
| `/api/in/tracwork` | Job Tracker: arrive / start / evidence / end | `tracker`, `evidence`; moves `scheduled → in_progress → complete` |
| `/api/in/quickbooks` | Bill created / paid | `paid`, `paid_at`; fires payout orb |
| `/api/out/zendesk` | (called by us) | mirror every message and stage change as ticket comments/tags |
| `/api/out/workapp` | (called by us) | create/update the job record |
| `/api/rosie` | UI | Anthropic Messages API with server-side key |

Automated messages (1-hour confirmation, 5-minute check-in nudge) are cron jobs (`vercel.json` crons every minute) that read `jobs` and send via TrueDialog.

## 9. Rosie

- Move the prompt-building from `askRosie()` / `loadInsight()` into `/api/rosie`. The route receives `{mode, scope, turns}` and builds the board snapshot **server-side from Supabase** (same columns as `boardSnapshot()`), so the client never sends the whole board.
- Model: `claude-sonnet-4-6` for chat and insight cards; stream the response.
- Modes: Situation / Recommendation / Prediction prompts are in `loadInsight()`; keep them.
- Voice in: Web Speech API (`SpeechRecognition`) — works as-is over HTTPS.
- Voice out: browser `speechSynthesis` with the ranked-voice picker (`voicesFor()`), or optionally an `/api/tts` route (ElevenLabs / Google Cloud TTS) for a consistent voice across machines.

## 10. Reports

`jobReport()` renders a print-ready HTML page per job. In production, render the same template server-side with Puppeteer (`page.pdf()`) in an API route, store the PDF in Supabase Storage, and email it to the property manager on validation (this is PINCH's existing evidence PDF).

## 11. Deployment steps

1. `npx create-next-app jobrun` (App Router, TypeScript). Add `@supabase/supabase-js`, `mapbox-gl`, `@anthropic-ai/sdk`.
2. Copy the prototype's CSS into `app/globals.css`; port sections to components in this order: board → modal → filters/rail → map → Rosie.
3. Run `schema.sql`; import data (§5); set env vars (§3).
4. Implement adapters (§4) behind `CONFIG.SIMULATE`; flip to `false` per adapter as each lands.
5. Add API routes (§8) and crons.
6. `vercel --prod`. Verify: board loads from Supabase, a Gmail request creates a Pending card, a TrueDialog reply flips the blue indicator, a Job Tracker check-in moves the job to In Progress, a QuickBooks payment fires the orb.

## 12. Acceptance checklist (matches what Federico signed off in the prototype)

- [ ] Five lanes, card states (dashed/dark-gray unassigned, red bar/fill thresholds, blue message icon, paid green)
- [ ] Pending modal: AI sender suggestion, job details with AI/You tags, time window, cleaner availability list, checklist gates
- [ ] Scheduled/In Progress/Complete/Validation modal: tabs, Job Tracker panel with before/after photos, Actions menu with reasons, add-ons, price badge, download report
- [ ] Observe/Geo/health/operator filters, focus chip counts scope, black selection bar with "hidden by filters"
- [ ] Map: MetaMAP-style pins/clusters, location list mirrors view, incident chips filter, incident cards fly in/out (10 s), tour with flyTo + narration, traffic 4 levels, weather chips, payout orb above markers
- [ ] Rosie: Situation/Recommendation/Prediction, Focused/Global, insight card, chat, hold-to-talk, read aloud, voice picker
- [ ] Mobile layout (rail at bottom, stacked modal header, swipeable lanes)
