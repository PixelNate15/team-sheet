# Team Sheet (working name)

A cross-platform (iOS + Android) rebuild of the Tkinter **Sport Team Management** app in `../Original_Code`, for tennis doubles league teams. It's built with **Expo / React Native** and **Supabase** (Postgres, Auth, Row Level Security).

Members set their availability, report injuries, see team selection and results, and rate their partners. Captains manage their squad, fixtures, team selection (with the original form-score and recommended-team algorithms) and results. Club admins manage teams, seasons, divisions and members. A single install serves any number of clubs: each club joins with a 6-character code.

## Project layout

```
src/app/            Expo Router screens
  (auth)/           sign in, sign up, reset password
  onboarding/       join a club with a code, or create one
  (member)/         tabs: Home, Fixtures, Results, Feedback, Me
  (captain)/        tabs: Squad, Fixtures, Results, Club (+ admin pages)
  fixture/, result/, availability/, give-feedback/, player/, fixture-edit, result-entry/ ...
src/components/     UI kit (cards, buttons, pickers, charts, team sheet, pair picker)
src/lib/            Supabase client, data access (api.ts), auth context, scoring rules
supabase/migrations Postgres schema, RLS policies and RPC functions
supabase/tests/     pgTAP tests (algorithm parity, result rules, security)
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

## Getting started

1. **Install:** `npm install` (Node 20+).
2. **Supabase project:** create a free project at supabase.com (this one is in Ireland, eu-west-1).
3. **Database:** apply the migrations:
   ```bash
   npx supabase db push --remote="postgresql://postgres.<ref>:<password>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres" --yes
   ```
4. **Tests:** run the database tests against the same URL. They roll back everything they create. (`supabase test db` needs Docker; this script doesn't.)
   ```bash
   SUPABASE_DB_URL="<same url>" npm run test:db
   ```
5. **Keys:** copy `.env.example` to `.env` and fill in the Project URL and the publishable (anon) key from *Project Settings → API*. Never put the service-role key in the app.
6. **Auth settings** (Supabase dashboard → Authentication):
   - Keep **Confirm email** on.
   - Set the **Site URL** to a page that says "Email confirmed – return to the app" (e.g. on evolvit.co.uk).
   - Customise the email templates with the app name.
7. **Run:** `npx expo start`, then open the app in Expo Go or a development build.
   - Push notifications need a development build and an EAS project id: run `npx eas-cli@latest init`, then `npx eas-cli@latest build --profile development`.

### Checks

```bash
npm run typecheck   # TypeScript
npx eslint src      # lint
npm test            # unit tests (scoring rules)
npm run test:db     # database tests (needs SUPABASE_DB_URL)
npx expo-doctor     # dependency / config check
```

## Release (Evolvit developer accounts)

1. Replace the placeholder icons and splash in `assets/`, and confirm the name and bundle id (`uk.co.evolvit.teamsheet`) in `app.json`.
2. Host `docs/privacy-policy.md` and set `PRIVACY_POLICY_URL` and `SUPPORT_EMAIL` in `src/lib/config.ts`.
3. Set the EAS environment variables `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for `preview` and `production`.
4. Build the release binaries:
   ```bash
   npx eas-cli@latest build --profile production --platform all
   ```
5. Submit to the stores:
   ```bash
   npx eas-cli@latest submit --platform ios      # TestFlight / App Store (Apple developer account)
   npx eas-cli@latest submit --platform android  # Play Console (needs a Google Play developer account)
   ```
6. Create a **demo club and demo account** for App Review, and give the credentials in the review notes.
7. Upgrade Supabase to **Pro** before real clubs rely on it. The free tier pauses after 7 days of inactivity and has no daily backups.

## Push notifications

The database sends notifications directly to the Expo push service (`public.send_push`, using `pg_net`). No extra server is needed. Players are notified when:

- a fixture is added, changed or cancelled
- they are selected
- the captain chases availability
- a result is posted (with a reminder to rate their partner)
