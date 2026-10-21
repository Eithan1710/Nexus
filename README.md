# Nexus · הידע שלי

A Hebrew, mobile-first personal knowledge hub. Topics hold notes, ideas, links and checklists; a
quick-capture sheet saves a thought in seconds from anywhere; global search covers everything.
Installable on iPhone as a PWA.

**Live:** https://eithan1710.github.io/Nexus/

## Stack

- React + Vite, no router or UI library (hash routes for GitHub Pages)
- Supabase auth + Postgres (`nx_topics`, `nx_items`) with owner-only Row Level Security
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

## Database

Schema lives in `supabase/migrations/`. Tables are prefixed `nx_` because the Supabase project is
shared with other apps.

## Accounts

There is no sign-up. Users sign in with a username; `src/screens/Auth.jsx` maps it to an
internal Supabase email (`u-<utf8 hex>@users.nexus.local`) and prefixes the password with
`nexus:`. New accounts are created directly in Supabase Auth with those values.

## Note format

Notes are plain text with a few light conventions rendered in the reading view:
`- [ ]` checklist (tap to tick), `- ` bullets, `1. ` numbered, `## ` heading, `**bold**`,
`` `code` ``, ``` fences, `> ` quote, and URLs become links.
