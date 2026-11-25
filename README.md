# Team Sheet

A cross-platform (iOS, Android) app for running tennis doubles league teams, built with **Expo / React Native** and **Supabase** (Postgres, Auth, Row Level Security).

## Features

- **Members** set their availability, report injuries, see team selection, fixtures and results, track their partnerships and rate their partners.
- **Captains** manage their squad, fixtures, team selection (with form scores and a recommended team), results and the division's league table.
- **Club admins** manage teams, seasons, divisions and members.
- **Multi-club:** one install serves any number of clubs. Players join a club with a 6-character code.
- **Push notifications** for fixture changes, selection, availability chasers, automatic reminders and new results.
- **Light and dark mode**, following the device setting or chosen in the app.

## Tech stack

| Area | Choice |
| --- | --- |
| App | Expo, React Native, Expo Router, TypeScript |
| Data fetching | TanStack Query |
| Backend | Supabase: Postgres, Auth, Row Level Security, RPC functions |
| Scheduled jobs | `pg_cron`; notifications sent from the database via `pg_net` to the Expo push service |
| Tests | Jest (app logic), pgTAP-style SQL tests (database rules and security) |

## Project layout

```
src/app/            Expo Router screens
  (auth)/           sign in, sign up, forgot password
  onboarding/       join a club with a code, or create one
  (member)/         tabs: Home, Fixtures, Results, Feedback, Me
  (captain)/        tabs: Squad, Fixtures, Results, Club (+ admin pages)
  league/           a division's league table
  auth-callback     where email links (confirm, reset) land
  ...               fixture, result, availability, feedback, player and editing screens
src/components/     UI kit (cards, buttons, pickers, charts, team sheet, stats lists)
src/lib/            Supabase client, data access, auth, notifications, calendar, scoring rules
src/theme/          design tokens (colours, type, spacing) for light and dark
supabase/migrations Postgres schema, RLS policies, RPC functions and scheduled jobs
supabase/tests/     database tests
scripts/            database push and test runners
docs/               supporting documents
```

## Getting started

1. **Install:** `npm install` (Node 20+).
2. **Supabase:** create a project at [supabase.com](https://supabase.com).
3. **Environment:** copy `.env.example` to `.env`. Fill in the project URL and publishable key. To push migrations or run the database tests, also add the database password. Read [Security](#security) first.
4. **Database:** apply the migrations, then run the database tests. The tests roll back everything they create.
   ```bash
   npm run db:push -- --dry-run   # see what would be applied
   npm run db:push
   npm run test:db
   ```
   If your project's session pooler host differs from the default in `scripts/db-url.mjs`, set `SUPABASE_DB_HOST` in `.env`.
5. **Auth settings** (Supabase dashboard → Authentication):
   - Keep **Confirm email** on.
   - Add `exp://**` (Expo Go) and `teamsheet://**` (builds) to the **Redirect URLs**, so email links open the app.
   - Set the **Site URL** to a simple "Email confirmed – return to the app" page.
6. **Run:** `npx expo start`, then open the app in Expo Go or a development build. Calendar export and push notifications need a development build (`npx eas-cli@latest build --profile development`).

## Checks

```bash
npm run typecheck   # TypeScript
npx expo lint       # lint
npm test            # unit tests
npm run test:db     # database tests (needs the database password in .env)
npx expo-doctor     # dependency / config check
```

## Security

This repository is public and contains **no secrets**.

| Value | Where it goes | Ships in the app? |
| --- | --- | --- |
| Project URL and **publishable** key | `.env` as `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes. It's designed to be public; Row Level Security decides what each user can see. |
| **Database password** (migrations and tests only) | `.env` as `SUPABASE_DB_PASSWORD` | **No.** Never give it the `EXPO_PUBLIC_` prefix. |
| **Service-role / secret key** | Not used by this project | **Never.** It bypasses Row Level Security. |

- Anything prefixed `EXPO_PUBLIC_` is compiled into the app and can be extracted.
- `.env` and every `.env.*` file except `.env.example` are git-ignored.
- The database scripts read the password from `.env` and mask it in output; in CI, provide `SUPABASE_DB_URL` as a secret instead.
- Every table has Row Level Security. Functions are callable only by signed-in users; internal ones (push sending, reminders) by nobody. The database tests check this as different users.

## Building and releasing

Builds use [EAS](https://docs.expo.dev/eas/). Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as EAS environment variables (the database password is not needed for builds), then:

```bash
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --platform ios
npx eas-cli@latest submit --platform android
```

Before release, set your own bundle identifier in `app.json` and your privacy policy URL and support email in `src/lib/config.ts`.

## License

See [LICENSE](LICENSE).
