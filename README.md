# Team Sheet (working name)

A cross-platform (iOS + Android) rebuild of the Tkinter **Sport Team Management** app, for tennis doubles league teams. It's built with **Expo / React Native** and **Supabase** (Postgres, Auth, Row Level Security).

Members set their availability, report injuries, see team selection and results, track their partnerships, and rate their partners. Captains manage their squad, fixtures, team selection (with the original form-score and recommended-team algorithms), results and the division's league table. Club admins manage teams, seasons, divisions and members. A single install serves any number of clubs: each club joins with a 6-character code.

## Project layout

```
src/app/            Expo Router screens
  (auth)/           sign in, sign up, forgot password
  onboarding/       join a club with a code, or create one
  (member)/         tabs: Home, Fixtures, Results, Feedback, Me
  (captain)/        tabs: Squad, Fixtures, Results, Club (+ admin pages)
  league/           a division's league table (view; edit for captains/admins)
  auth-callback     where email links (confirm, reset) land; signs the player in
  reset-password    choose a new password after a reset link
  fixture/, result/, availability/, give-feedback/, player/, fixture-edit, result-entry/ ...
src/components/     UI kit (cards, buttons, pickers, charts, team sheet, pair picker, stats lists)
src/lib/            Supabase client, data access (api.ts), auth, email-link handling, calendar, scoring rules
supabase/migrations Postgres schema, RLS policies, RPC functions and the reminder job
supabase/tests/     pgTAP tests (algorithm parity, result rules, security, features)
scripts/            database push and test runners (read the password from .env, never print it)
docs/               privacy policy draft, roadmap
```

### Where the original code went

| Original (Python) | New |
|---|---|
| `SQL/*.py` (direct MariaDB connection with a hard-coded password) | `src/lib/api.ts` → Supabase REST/RPC, protected by RLS |
| `System/form_score_calculation.py` | `public.form_score()` in `supabase/migrations/…_functions.sql` (same formula, one query) |
| `System/generate_recommended_team.py` | `public.recommended_team()` |
| `captain_add_or_edit_result.py` + `results_table.py` | `src/app/result-entry/` + `src/lib/scoring.ts` + `public.save_fixture_result()` (one transaction) |
| `login_screen.py`, `create_account.py` (bcrypt, generated usernames) | Supabase Auth (email + password, verification, reset) |
| `draw_graph.py` (matplotlib) | `src/components/LineChart.tsx` (SVG) |

## Security and secrets

This repo is public, so it contains **no secrets**. The original app leaked its database password through git history; these rules stop that happening again.

| What | Where it lives | Safe in the app? |
|---|---|---|
| Project URL, **publishable** key | `.env` as `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes. It's designed to ship; Row Level Security decides what each user can see. |
| **Database password** (migrations and tests only) | `.env` as `SUPABASE_DB_PASSWORD` | **No.** It must never have the `EXPO_PUBLIC_` prefix. |
| **Service-role / secret key** | Nowhere in this project | **Never.** It bypasses Row Level Security. |

- **`EXPO_PUBLIC_` means public.** Expo builds every variable with that prefix into the app, where anyone can extract it. Only the URL and publishable key may use it.
- **`.env` files are never committed.** `.gitignore` ignores `.env` and every `.env.*` variant except the blank `.env.example`. Check with `git check-ignore -v .env`.
- **Don't type the password on the command line** (it ends up in your shell history). `npm run db:push` and `npm run test:db` read it from `.env` and mask it in any output (`scripts/db-url.mjs`). In CI, set `SUPABASE_DB_URL` as a secret instead.
- **Commit with GitHub's private email.** Set `git config --global user.email "<id>+<username>@users.noreply.github.com"`, then tick *Keep my email addresses private* and *Block command line pushes that expose my email* in GitHub → Settings → Emails.
- **Every table has Row Level Security**, and functions are callable only by signed-in users (internal ones, like the push sender and the reminder job, by nobody). The database tests check this as different users.
- **Rehearse migrations before pushing:** run them on the database inside `begin; … rollback;`. That surfaces real errors and leaves nothing behind. `npm run db:push -- --dry-run` lists what would be applied.

## Getting started

1. **Install:** `npm install` (Node 20+).
2. **Supabase project:** create a free project at supabase.com (this one is in Ireland, eu-west-1).
3. **Environment:** copy `.env.example` to `.env`. Fill in the Project URL and publishable key (*Project Settings → API*), plus `SUPABASE_DB_PASSWORD` (*Project Settings → Database*) if you'll push migrations or run the database tests. Read [Security and secrets](#security-and-secrets) first.
4. **Database:** apply the migrations, then run the database tests. The tests roll back everything they create. (`supabase test db` needs Docker; this script doesn't.)
   ```bash
   npm run db:push -- --dry-run   # see what would be applied
   npm run db:push
   npm run test:db
   ```
   The scripts connect via the `aws-1-eu-west-1` session pooler. If your project is elsewhere, set `SUPABASE_DB_HOST` in `.env` (see *Connect → Session pooler* in the dashboard).
5. **Auth settings** (Supabase dashboard → Authentication):
   - Keep **Confirm email** on.
   - **URL Configuration → Redirect URLs:** add `exp://**` (Expo Go) and `teamsheet://**` (builds). Email links open the app through these; anything not on the list falls back to the Site URL.
   - Set the **Site URL** to a page that says "Email confirmed – return to the app".
   - Customise the email templates with the app name.
6. **Run:** `npx expo start`, then open the app in Expo Go or a development build.
   - **Add to calendar** and **push notifications** need a development build (`expo-calendar` isn't in Expo Go). Run `npx eas-cli@latest init`, then `npx eas-cli@latest build --profile development`.

### Checks

```bash
npm run typecheck   # TypeScript
npx expo lint       # lint
npm test            # unit tests (scoring rules)
npm run test:db     # database tests (needs SUPABASE_DB_PASSWORD in .env)
npx expo-doctor     # dependency / config check
```

## Release (Evolvit developer accounts)

1. Replace the placeholder icons and splash in `assets/`, and confirm the name and bundle id (`uk.co.evolvit.teamsheet`) in `app.json`.
2. Host `docs/privacy-policy.md` and set `PRIVACY_POLICY_URL` and `SUPPORT_EMAIL` in `src/lib/config.ts`.
3. Set the EAS environment variables `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for `preview` and `production`. Don't add the database password to EAS; builds don't need it.
4. Build the release binaries:
   ```bash
   npx eas-cli@latest build --profile production --platform all
   ```
5. Submit to the stores:
   ```bash
   npx eas-cli@latest submit --platform ios      # TestFlight / App Store (Apple developer account)
   npx eas-cli@latest submit --platform android  # Play Console (needs a Google Play developer account)
   ```
6. Create a **demo club and demo account** for App Review, and give the credentials in the review notes (not in this repo).
7. Upgrade Supabase to **Pro** before real clubs rely on it. The free tier pauses after 7 days of inactivity and has no daily backups.

## Push notifications

The database sends notifications directly to the Expo push service (`public.send_push`, using `pg_net`). No extra server is needed. Players are notified when:

- a fixture is added, changed or cancelled
- they are selected
- the captain chases availability
- **automatically**, 5 days and 2 days before a fixture they haven't replied to (a daily `pg_cron` job at 09:00 UTC, `public.send_availability_reminders`)
- a result is posted (with a reminder to rate their partner)
