# Team Sheet

**Run your tennis doubles league team from your phone.** Team Sheet brings availability, team selection, results and partner feedback into one app for iOS and Android, so nobody has to chase replies in group chats or keep a spreadsheet up to date.

## Who it's for

- **Players:** know when you're playing, who you're partnering and how your season is going.
- **Captains:** pick the team from who's actually available, then record results in a couple of taps.
- **Club admins:** set up teams, seasons and divisions, and manage who's in the club.

## What you can do

### As a player
- See your upcoming fixtures, with the date, time, venue and whether it's home or away.
- Say whether you can play with one tap, and get reminders if you haven't replied.
- Find out as soon as you're selected, and who your partner is.
- Let your captain know when you're injured, and when you're fit again.
- Follow your results, form and record with each partner, including your best pairings.
- Rate your partner after a match. The feedback helps captains choose pairings.
- Sort out lifts to away matches: offer seats in your car, or ask for a lift.
- Chat with the team about each fixture, and see your captain's pinned notices.
- See any match fees you owe.
- Add a profile photo so everyone knows who's who.
- Add fixtures to your phone's calendar.

### As a captain
- Manage your squad and fixtures.
- See who's available at a glance, and chase anyone who hasn't replied.
- Pick the team with help from form scores and a suggested line-up.
- Short of players? Borrow someone from a lower team for one match. Each player can play up twice a season, and Team Sheet keeps count.
- Enter rubber-by-rubber scores, and Team Sheet works out the result.
- Keep your division's league table up to date. Opponents' positions fill in automatically when you add a fixture.
- Set a match fee and tick off who's paid.
- Post notices that go straight to the whole team.
- Create a season report PDF with every result and each player's record.

### As a club admin
- Create the club and share a 6-character code so members can join.
- Set up teams, seasons and divisions, and manage members and their roles.
- Import a list of players from a spreadsheet. When they sign up, they join the right team automatically.

## Notifications

Team Sheet keeps everyone in the loop automatically. You'll get a notification when:
- a fixture is added, changed or cancelled
- you're selected
- your captain asks for your availability
- a fixture is 5 days and 2 days away and you haven't replied
- a result is posted (with a nudge to rate your partner)
- your captain posts a notice
- someone gives you a lift, or you're asked to play up

You can turn notifications off at any time in **Me**.

## Getting started

1. Install Team Sheet and create an account with your email address.
2. Confirm your email using the link Team Sheet sends you.
3. Join your club with the code from your captain or club admin, or create a new club.

One app works for any number of clubs, and each club only sees its own members, fixtures and results.

## Your data

- Your club can see your name, fixtures, selection, results and injury status. Other clubs see none of it.
- Partner feedback is seen only by you, the partner it's about, and your captains and admins.
- You can clear an injury at any time once you're fit again.
- You can leave a club or permanently delete your account from **Me** in the app.

## Look and feel

Team Sheet has light and dark modes. It follows your phone's setting, or you can choose one in **Me → Appearance**. Colour is never the only signal: statuses and results always come with text too.

---

<details>
<summary>For developers</summary>

Team Sheet is built with Expo / React Native and Supabase (Postgres, Auth, Row Level Security).

```bash
npm install
cp .env.example .env    # add your Supabase project URL and publishable key
npm run db:push         # apply the database migrations
npx expo start
```

To try it with realistic sample data (made-up players, fixtures, results and a league table), run `npm run db:seed`, and `npm run db:unseed` to remove it.

Checks: `npm run typecheck`, `npx expo lint`, `npm test` and `npm run test:db`. Calendar export and push notifications need a development build. Only the publishable key goes in the app; secret keys and database passwords never do.

</details>

## License

See [LICENSE](LICENSE).
