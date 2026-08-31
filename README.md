# HOLDPOINT

A gaming streaming and community platform: watch → interact → join a community →
find players → form a team → compete → clip → build a record. The product stays
useful when nobody is live, which is the point of the name.

Built from the 46-section master build prompt.

## Running it

```bash
npm install                      # runs prisma generate via postinstall
cp .env.example .env             # set DATABASE_URL and SESSION_SECRET
openssl rand -base64 32          # → SESSION_SECRET
npx prisma db push
npm run db:seed
npm run dev
```

Demo account: `demo@holdpoint.gg` / `password123`. Every seeded player uses the
same password.

> Neon note: use the **direct/unpooled** connection string for `db push` and
> seeding. Prisma is pinned to **v6 on purpose** — v7 moves `url` out of the
> datasource block into `prisma.config.ts`. Upgrade deliberately, not by accident.

> R2 CORS: a fresh bucket has no CORS policy, and clip uploads PUT the video
> file directly from the browser to R2 — without one, that PUT fails in the
> browser with an opaque network error, not a helpful one. In the R2
> dashboard, open the bucket → **Settings** → **CORS Policy**, and add:
> ```json
> [
>   {
>     "AllowedOrigins": ["http://localhost:3000"],
>     "AllowedMethods": ["PUT"],
>     "AllowedHeaders": ["Content-Type"],
>     "MaxAgeSeconds": 3000
>   }
> ]
> ```
> Swap `http://localhost:3000` for wherever the app actually runs (add an
> entry per origin — local dev, any deployed domain). `PUT` is the only
> method that needs it: avatar/clip *playback* goes through this app's own
> API routes, which talk to R2 server-side, so only the direct upload PUT
> ever crosses origins.

## Design direction

- **Base** is a deep bottle-green ink (`#0d1310`), not neutral black, so the
  chartreuse signal reads as light on a surface rather than neon on void.
- **Chartreuse** (`#cbff4d`) is structural only: active state, focus, progress.
- **Red** (`#ff4438`) is reserved exclusively for LIVE. Nothing else may use it.
- **Gold** appears only on tournament objects; **ice** only on in-game presence.
- Type: Chakra Petch (display, uppercase, tracked), Inter (body), JetBrains Mono
  (all numbers — viewer counts, scores, timers, seeds).
- **Signature motif**: the corner tick. Four L-brackets that pull inward on hover,
  borrowed from capture-point HUD framing. It is the one repeated flourish;
  everything around it stays quiet. Corners are chamfered, never rounded.
- Glass is confined to floating layers (player controls, menus, sheets, bracket
  overlay). Content surfaces stay opaque.
- No emoji anywhere. Icons are Lucide.

**All artwork is generated, not borrowed.** Stream thumbnails, game covers, team
emblems and avatars are deterministic SVG/CSS derived from a seed string
(`src/lib/art.ts`), so nothing in the app depends on copyrighted game art or real
esports logos. Games are original fictional titles with plausible rank ladders.

## What's real

Logic that would normally be faked is implemented and verified:

- `src/lib/brackets.ts` — single elimination (standard seed placement), double
  elimination (alternating minor/major losers rounds, reverse cross-mapped drops),
  round robin (circle method) with standings. Verified for n = 4, 8, 16 against
  match-count formulas, unique coordinates, resolvable routing, and the invariant
  that every bracket slot is fed exactly twice: `npx tsx scripts/verify-brackets.ts`.
- `src/lib/compatibility.ts` — play compatibility over seven weighted, named
  factors. The UI renders the same reasons the score is built from.
- `src/lib/highlights.ts` — automatic clip detection from chat spikes, viewer
  spikes, game events and markers, with overlapping windows collapsed.
- `src/lib/progression.ts` — XP curve and level thresholds; unlocks are cosmetic
  only, and passive watch XP is capped per day.
- `src/lib/session.ts` — HMAC-signed session cookies, DB-backed, httpOnly,
  30-day expiry, with a timing-safe comparison. Auth uses bcrypt cost 12 plus a
  dummy-hash compare so login timing can't enumerate accounts.
- `prisma/seed.ts` calls the real bracket generator and plays out a first round,
  so the seed doubles as a correctness check.

Run both check scripts: `npx tsx scripts/verify-brackets.ts` and
`npx tsx scripts/verify-logic.ts`.

## Built so far

Schema for all 33 models in spec §40, plus voice rooms, polls/predictions,
community points and channel bans.

Screens: login/register, three-step onboarding, home feed (live + continue
watching + communities + recommended players + tournaments + clips), Live,
Discover, stream page (player, chat, prediction panel), vertical clip feed with
keyboard nav, Find Players + LFG, Teams list/detail, Communities list/detail with
channels and voice rooms, Tournaments list/detail with an interactive zoom-and-pan
bracket and round-robin standings, gaming profile, creator dashboard, notifications,
messages.

## Not built yet

- WebSockets. Chat, presence, viewer counts and live scores are server-rendered;
  the socket layer is unwired and chat posts are local-only.
- Real streaming infrastructure. The architecture in §39 (RTMP ingest →
  transcode → HLS/CDN) is modelled in the schema (stream key, ingest URL,
  latency mode) but there is no ingest server. The player is a UI shell.
- Object storage for avatars, banners, clips and VODs.
- Monetisation: subscription tiers and revenue exist in the schema; there is no
  payment provider wired in.
- Highlight Studio UI, moderation dashboards, tournament creation forms, and the
  create-flows behind the Create menu.
- Mutations generally: most action buttons are optimistic UI over server-rendered
  data. Auth and onboarding are the two flows that write for real.

## Known state

`npx tsc --noEmit` currently reports errors that all trace to `@prisma/client`
not being generated — the sandbox this was built in can't reach Prisma's binary
host. They clear once `npm install` runs with network access. Nothing in
`src/components` errors.
