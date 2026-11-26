# Roadmap

## Built

**Core:** email sign-up and sign-in with verification and password reset; clubs with join codes and admin screens; squads, seasons and divisions; availability with reminders; team selection with form scores and a suggested line-up; rubber-by-rubber results; partner feedback; injuries; push notifications; light and dark mode; in-app account deletion.

**Feature batch 1:** automatic availability reminders, add to calendar, partnership stats (best pairings and head-to-head), and captain-entered league tables.

**Feature batch 2:**
- Lift-sharing for fixtures
- Fixture chat with captain's notices
- Match fees, with payments recorded by captains
- Profile photos
- Season report PDF
- Importing players from a CSV file as invites
- League positions filled in from the table
- Playing up: borrowing a player from a lower team, at most twice per player per season

**Feature batch 3:**
- Club-wide chat
- Polls in chats
- Drop-out alerts with a suggested replacement
- Result reminders, and players sending scores for the captain to check
- Selection balance
- Away dates (holidays)
- Venue book
- Season awards

## Needed before store release

- [ ] Confirm the app name
- [ ] Host the privacy policy (`docs/privacy-policy.md`, draft) and set `PRIVACY_POLICY_URL` / `SUPPORT_EMAIL` in `src/lib/config.ts`
- [ ] Custom email (SMTP) for Supabase Auth. The built-in sender is limited to a few emails an hour and only delivers to the project's team.
- [ ] A Supabase Auth "Site URL" page and branded email templates
- [ ] A demo club and account for App Review
- [ ] A Google Play developer account
- [ ] Supabase Pro once clubs rely on it (daily backups, no pausing)

## Ideas for later

- Sign in with Apple and Google
- A home-screen widget for the next fixture
- Card payments for match fees
- Per-player calendar feed (iCal)
