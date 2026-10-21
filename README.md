# Nexus · הידע שלי

A Hebrew, mobile-first personal knowledge hub. Topics hold notes, ideas, links and checklists; a
quick-capture sheet saves a thought in seconds from anywhere; global search covers everything.
Installable on iPhone as a PWA.

**Live:** https://eithan1710.github.io/Nexus/

## Stack

- React + Vite, no router or UI library (hash routes for GitHub Pages)
- Supabase auth + Postgres (`nx_topics`, `nx_items`, `nx_reminders`) with owner-only Row Level Security
- Smart reminders: typed in plain Hebrew or English, delivered by Web Push from the server (see below)
- Local-first data layer (`src/store.js`): changes apply instantly, are cached on the device and
  sent through a persisted outbox, so nothing is lost offline. Item edits carry a version number;
  if the same note was changed on another device, both versions are kept.

## Develop

```bash
npm install
npm run dev
```

Pushing to `main` builds the app and deploys it to GitHub Pages with GitHub Actions
(`.github/workflows/deploy.yml`). Pages source must be set to "GitHub Actions".

## Tests

```bash
npm test
```

Unit tests (node's built-in runner) cover the natural-language parser, timezone and DST handling,
recurrence, and delivery/retry decisions. They also run before every deploy.

## Database

Schema lives in `supabase/migrations/`. Tables are prefixed `nx_` because the Supabase project is
shared with other apps.

## Accounts

There is no sign-up. Users sign in with a username; `src/screens/Auth.jsx` maps it to an
internal Supabase email (`u-<utf8 hex>@users.nexus.local`) and prefixes the password with
`nexus:`. New accounts are created directly in Supabase Auth with those values.

## Note format

Notes are plain text with a few light conventions rendered in the reading view:
`- [ ]` checklist (tap to tick; ticked items are saved as `- [✓]`, which keeps Hebrew lines right-to-left while editing; `[x]` is also accepted), `- ` bullets, `1. ` numbered, `## ` heading, `**bold**`,
`` `code` ``, ``` fences, `> ` quote, and URLs become links.

## Reminders

Type a reminder the way you would say it ("מחר בארבע בצהריים לאסוף חבילה", "Every Sunday at 8 PM
review my goals"). `src/lib/reminderParse.js` extracts the task, date, time and recurrence on the
device (no AI service or API key). Anything it can't settle, such as a missing time or an hour that
could be morning or evening, is asked in the confirmation step rather than guessed.

Delivery runs entirely on the server, so it works with Nexus closed:

1. `nx_reminders.due_at` is the next time to notify. Times are wall-clock in the reminder's
   timezone (Asia/Jerusalem), so DST changes don't shift them (`supabase/functions/_shared/nx-time.js`).
2. pg_cron job `nx-reminders-dispatch` runs every minute and, only when something is due, calls the
   `nx-reminders` Edge Function with a secret kept in Vault (`nx_cron_secret`).
3. The function claims due rows atomically (`nx_claim_due_reminders`, `FOR UPDATE SKIP LOCKED`,
   status `sending`), so overlapping runs never notify twice. It sends Web Push to every device of
   the user, retries temporary failures (1, 2, 4, 8, 16 min, 6 attempts), removes dead
   subscriptions (404/410), and moves recurring reminders to their next occurrence.
4. The service worker (`public/sw.js`) shows the notification; tapping it opens `#/r/<id>`.

The VAPID key pair is generated on first use and stored in Vault (`nx_vapid`); nothing secret is in
the repo or the browser. Push subscriptions are only reachable through `nx_save_push_subscription`,
`nx_delete_push_subscription` and `nx_push_status`, which are scoped to the signed-in user.

On iPhone, Web Push requires iOS 16.4+ and Nexus added to the Home Screen; the app explains this
when it's opened in Safari.

Redeploy the function with the Supabase CLI: `supabase functions deploy nx-reminders --no-verify-jwt`
(it authenticates cron with its own secret). Check the schedule with
`select * from cron.job where jobname = 'nx-reminders-dispatch'`.
