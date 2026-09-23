# jobRUN — what we need to go live

Status as of Sep 23, 2026. The app is deployed at https://jobrun-chi.vercel.app in **simulation mode**: the full
prototype (board, job modals, header, filters, map, Rosie) runs on PINCH's 1,479 real properties with simulated jobs.
Everything below is what's needed to switch it to real operations.

## 1. Accounts and access (BOSS / Federico)

| Item | Why | Where it goes |
|---|---|---|
| Operator accounts | Nobody can sign in until each operator exists in Supabase Auth **and** in the `operators` table | Supabase → Authentication → Add user; `insert into operators (name, email) …` |
| Switch to live data | After operators exist | Vercel env `NEXT_PUBLIC_SIMULATE=false`, redeploy |
| Anthropic API key | Rosie (chat, insight cards) | Vercel env `ANTHROPIC_API_KEY` |
| Vercel ↔ GitHub | Automatic deploys on push | Install the Vercel GitHub App on the BossTechnology org, then `vercel git connect` |
| Magic-link sign-in (optional) | Password sign-in already works | Supabase → Auth → URL Configuration → add `https://<domain>/auth/callback` |
| Resend key + sender (optional) | Email the evidence PDF to the property manager on validation | `RESEND_API_KEY`, `REPORT_FROM` |
| TomTom / OpenWeather keys (optional) | Live traffic and weather on the map (simulated today) | `TOMTOM_TRAFFIC_KEY`, `OPENWEATHER_KEY` |

## 2. From PINCH — data

- **Cleaning teams (PINCH Pros)**: name, phone, email, subscription (Member, O.G., Max, Elite, Quick Pay…), states served, and the **default team per property**. The board currently uses 12 placeholder teams.
- **Operations team**: names and emails of the ~7 operators.
- **Customer "CRM"** (135 properties): real customer or an internal/test bucket?
- **Test companies**: 14 companies with "test", "QA" or "prueba" in the name (32 rows) were left out of the import. Confirm they're test data.
- **12 properties without coordinates**, 4 of them look like junk rows ("CT", "Ignore Deal Size", "Cardinal - Peak of Boone", "ROUTE - JANPRO - First Franklin Financial"). Confirm addresses or delete.

## 3. From PINCH — systems access (each is a stub returning 501 today)

| System | What we need | jobRUN side |
|---|---|---|
| **Gmail** (request inbox) | Which inbox(es); a Google Cloud project with Gmail API + Pub/Sub push to `/api/in/gmail` | Create Pending jobs from emails, AI sender/field extraction |
| **TrueDialog** (texts to cleaners) | API credentials and docs for send + inbound webhook format | Outbound texts go through Twilio until then (`TWILIO_*`), inbound Twilio texts already work |
| **TracWork / Job Tracker** | How it exposes arrive / start / photos / end (API or webhooks) | `/api/in/tracwork` → tracker + evidence, moves Scheduled → In Progress → Complete |
| **QuickBooks** | Intuit app (client id/secret) and which event marks a bill paid | `/api/in/quickbooks` → paid / paid_at, payout orb |
| **Work App** | API or DB access and the full list of required job fields | `/api/out/workapp` create/update |
| **Zendesk** | Subdomain, agent email, API token | Mirror already implemented (`ZENDESK_*`) |

## 4. Product decisions (Federico)

1. **Five lanes vs seven stages.** The prototype and this build use 5 lanes (Pending, Scheduled, In Progress, Complete, Validation). The product document describes 7 (Request, …, Confirmation, Compensation). We followed the prototype — confirm.
2. **Review window**: the board auto-confirms clean completed jobs after **4 hours** (prototype). Same for all customers?
3. **Automated texts**: 1-hour confirmation before the window, check-in nudge **5 minutes after the start** with no TracWork arrival. Confirm timing and wording.
4. **Quick-pay** target: 24 h (alert) / 48 h (critical) from Validation — confirm.
5. Open questions in the product document §10 (late cancellations, re-clean payment, evidence delay, who can reject, dispute window…) still apply.

## 5. Fixed or changed while porting (for the record)

- "Single family" properties had no type label/icon in the prototype, and "re" was labelled Retail though PINCH data says residential.
- The prototype assumed Eastern time was always UTC−4; windows are now DST-aware.
- The prototype's weather tint was keyed by FIPS code and never matched; now keyed by state.
- Same-named cities (Charleston SC / WV) collided in the Geo filter.
- Row-level security now requires an active operator (was: any signed-in user).
- Map runs on MapLibre + OpenFreeMap (free, no key) instead of Mapbox; switching to Mapbox later is a style URL change.
