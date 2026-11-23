# Problems found and roadmap

## Problems in the original app and how this rebuild handles them

| # | Problem (original) | Fix |
|---|---|---|
| 1 | The database password is hard-coded in `SQL/connection.py` and the insert scripts, and is in 6 commits pushed to GitHub. `home_ip.py` contains a secret in its URL. | **Change the MariaDB password and the IP secret, and make the GitHub repo private.** The new app only ships Supabase's publishable key; Row Level Security protects the data. |
| 2 | Login is skipped: `main.py:40` always opens as user 1. | Supabase Auth: sign in, sign up, email verification, password reset, sign out. |
| 3 | The client talks straight to the database and trusts any `user_id`. | RLS policies and security-definer RPCs check the signed-in user, their club and their role. |
| 4 | Leaving the "optional" league position blank crashes (`None.isdigit()`). | Validated with zod; blank is allowed. |
| 5 | A new fixture can't have a team picked. Fixtures dated today can't be edited. | Team picker works for new and existing fixtures. Only past dates are rejected. |
| 6 | Results save one match at a time. A failure leaves a fixture that can't be edited. | `save_fixture_result` saves all 4 rubbers in one transaction (tested). |
| 7 | The player card crashes for players with no matches (`round(None)`). | Form shows "–", and the chart shows "Not enough data yet". |
| 8 | N+1 queries: form is recalculated per match, per card and 11× per player screen. | Each calculation is a single SQL function. |
| 9 | Score checks accept impossible scores (1-0, 3-3), and the champ tie-break isn't tied to 1-1. | Proper tennis rules in both the app and the database (tested). |
| 10 | Weak sign-up: 4-character passwords, spaces silently trimmed, names with hyphens or apostrophes rejected, username edits ignored. | 8+ character passwords that aren't trimmed. Names allow `'` and `-`. Email login replaces generated usernames. |
| 11 | Deleting fixtures or injuries has no confirmation, and injury history is deleted. | Confirmation dialogs everywhere. Recovering keeps the injury history. |
| 12 | Back buttons go to fixed screens. | Native stack navigation goes back to where you came from. |
| 13 | Squads, captains and seasons can only be set up in SQL. | Club admin screens (teams, captains, divisions, seasons, members). |
| 14 | Seasons are global (`season.is_current`), which would break with more than one club. | Seasons and divisions belong to a club. |
| 15 | Feedback sliders start at 0 and can be submitted untouched. | Ratings start unset; you must choose all three. |

### Form-score quirks (ported as-is; confirm with the author before changing)

- **The score can be above 1.** The opponent factor `0.8 + (teams − position)/10` isn't normalised to division size; for example, a 10-team league gives up to 1.7.
- **Your score depends on your partner's form.** A strong partner raises your score and a weak one lowers it.
- **The 3-year window is measured from today**, not from the date being calculated.
- **One deliberate change:** the "≥ 2 fixtures played this season" check now counts that **squad's** fixtures. The original counted every fixture in the season, which was the same thing while there was only one club.

## Needed before store release

- [x] Email sign-up and sign-in, verification, password reset and sign out
- [x] Create a club or join with a code; admin screens
- [x] In-app account deletion (Apple and Google require it)
- [x] Consent at sign-up; date of birth no longer collected
- [x] Push notifications (selection, fixture changes, chase, results)
- [x] Loading, empty and error states, pull-to-refresh, confirmations
- [ ] **Real icon, splash and name** (the placeholders are Expo's)
- [ ] **Host the privacy policy** (`docs/privacy-policy.md`, draft) and set `PRIVACY_POLICY_URL` / `SUPPORT_EMAIL`
- [ ] A Supabase Auth "Site URL" page, and email templates branded with the app name
- [ ] A demo club and account for App Review
- [ ] A Google Play developer account (separate from the Apple account)
- [ ] Supabase Pro once paying clubs use it (backups, no pausing)

## Suggested next features

1. **Automatic availability reminders:** a daily `pg_cron` job pushes to non-responders 5 days and 2 days before each fixture.
2. **Add to calendar:** export fixtures to the phone calendar (`expo-calendar`), or a per-player iCal feed.
3. **Partnership stats:** win % for each pair, best pairings, and head-to-head records. The data is already in `match_players`.
4. **Lift-sharing for away fixtures:** "I can drive 2" / "I need a lift".
5. **Fixture chat or notice board** for each squad (Supabase Realtime).
6. **League table** entered by the captain. It would also keep the opponent's league position up to date automatically.
7. **Match fees:** track who has paid, with Stripe as an optional later step.
8. **Sign in with Apple and Google** (Apple requires Sign in with Apple if Google sign-in is offered).
9. **Profile photos** (Supabase Storage).
10. **Home-screen widget** for the next fixture, and a season report PDF export for admins.
11. **Importing players from CSV** for clubs moving from spreadsheets.
