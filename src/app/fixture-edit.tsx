import { useMutation, useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { z } from 'zod';

import { Avatar, Loading, SectionHeader } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Segmented, TextField } from '@/components/Field';
import { emptySlots, PairPicker, type Candidate, type Slots } from '@/components/PairPicker';
import { DateField, TimeField } from '@/components/Pickers';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import {
  fetchClubPlayers,
  fetchFixture,
  fetchFixtureAvailability,
  fetchFixtureTeam,
  fetchLeagueTable,
  fetchRecommendedTeam,
  fetchVenues,
  saveFixture,
  saveVenue,
  setFixtureFee,
} from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { formatForm, formatPence, parsePounds, shortTime, toIsoDate } from '@/lib/format';
import { leaguePositionFor } from '@/lib/league';
import { venueFor } from '@/lib/venues';
import { useRefreshAll } from '@/lib/hooks';
import { radius, space, useTheme } from '@/theme';

const schema = z.object({
  opponentName: z.string().trim().min(1, 'Enter the opponent').max(100, 'Too long'),
  location: z.string().trim().min(1, 'Enter the venue').max(200, 'Too long'),
  // Optional: blank is allowed (the original crashed on blank with None.isdigit()).
  leaguePosition: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[1-9]\d{0,1}$/.test(v), 'A whole number from 1 to 99, or leave blank'),
  notes: z.string().max(1000, 'Keep notes under 1000 characters'),
  fee: z.string().refine((v) => {
    const p = parsePounds(v);
    return p === null || (Number.isFinite(p) && p <= 100000);
  }, 'An amount like 5 or 5.50 (up to £1,000), or leave blank'),
});

type FieldErrors = Partial<Record<keyof z.infer<typeof schema>, string>>;

const nextSaturday = () => {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return toIsoDate(d);
};

/** Port of captain_add_or_edit_fixture.py, including the recommended-team aid. */
export default function FixtureEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const fixtureId = id ? Number(id) : null;
  const isNew = fixtureId == null;
  const fixture = useQuery({ queryKey: ['fixture', fixtureId], queryFn: () => fetchFixture(fixtureId!), enabled: !isNew });
  const team = useQuery({ queryKey: ['fixtureTeam', fixtureId], queryFn: () => fetchFixtureTeam(fixtureId!), enabled: !isNew });

  if (!isNew && (fixture.isPending || team.isPending)) return <Loading />;

  const f = fixture.data;
  const initialForm: FormState = f
    ? {
        opponentName: f.opponent_name,
        date: f.fixture_date,
        time: shortTime(f.start_time),
        location: f.location,
        isHome: f.is_home ? 'home' : 'away',
        leaguePosition: f.opponent_league_position ? String(f.opponent_league_position) : '',
        notes: f.notes ?? '',
        fee: f.match_fee_pence ? formatPence(f.match_fee_pence).slice(1) : '',
      }
    : { opponentName: '', date: nextSaturday(), time: '14:00', location: '', isHome: 'home', leaguePosition: '', notes: '', fee: '' };

  const initialSlots = emptySlots();
  for (const p of team.data ?? []) initialSlots[(p.pair_number - 1) * 2 + (p.selection_order - 1)] = p.user_id;

  return <FixtureForm fixtureId={fixtureId} fixtureSquadId={f?.squad_id ?? null} initialForm={initialForm} initialSlots={initialSlots} />;
}

interface FormState {
  opponentName: string;
  date: string;
  time: string;
  location: string;
  isHome: 'home' | 'away';
  leaguePosition: string;
  notes: string;
  /** Match fee in pounds as typed, e.g. "5" or "5.50". */
  fee: string;
}

function FixtureForm({
  fixtureId,
  fixtureSquadId,
  initialForm,
  initialSlots,
}: {
  fixtureId: number | null;
  fixtureSquadId: number | null;
  initialForm: FormState;
  initialSlots: Slots;
}) {
  const { c } = useTheme();
  const isNew = fixtureId == null;
  const { activeSquad, me, club, userId } = useSignedIn();
  const refresh = useRefreshAll();

  const replies = useQuery({ queryKey: ['availability', fixtureId], queryFn: () => fetchFixtureAvailability(fixtureId!), enabled: !isNew });
  const recommended = useQuery({ queryKey: ['recommended', fixtureId], queryFn: () => fetchRecommendedTeam(fixtureId!), enabled: !isNew });
  const players = useQuery({ queryKey: ['clubPlayers'], queryFn: fetchClubPlayers });

  const squadId = fixtureSquadId ?? activeSquad?.id ?? null;

  const squad = me.squads.find((s) => s.id === squadId);
  // New fixtures start with the squad's usual match fee.
  const [form, setForm] = useState<FormState>(() =>
    isNew && squad?.default_match_fee_pence ? { ...initialForm, fee: formatPence(squad.default_match_fee_pence).slice(1) } : initialForm,
  );
  // League position filled in from the division's table when the opponent matches.
  const league = useQuery({
    queryKey: ['league', squad?.division_id],
    queryFn: () => fetchLeagueTable(squad!.division_id!),
    enabled: !!squad?.division_id,
  });
  const [autoPosition, setAutoPosition] = useState(false);
  // Away venues come from the club's venue book.
  const venues = useQuery({ queryKey: ['venues', club.id], queryFn: () => fetchVenues(club.id) });
  const [autoVenue, setAutoVenue] = useState(false);
  const venue = form.isHome === 'away' ? venueFor(form.opponentName, venues.data) : null;
  const fillVenue = (opponent: string, isHome: 'home' | 'away') => {
    const v = isHome === 'away' ? venueFor(opponent, venues.data) : null;
    setForm((f) => {
      if (v && (f.location.trim() === '' || autoVenue)) return { ...f, location: v.address };
      if (!v && autoVenue) return { ...f, location: '' };
      return f;
    });
    setAutoVenue(!!v && (form.location.trim() === '' || autoVenue));
  };
  const [slots, setSlots] = useState<Slots>(initialSlots);
  const [teamTouched, setTeamTouched] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  // Squad players, annotated with availability for this fixture.
  const candidates: Candidate[] = useMemo(() => {
    const status = new Map((replies.data ?? []).map((r) => [r.user_id, r]));
    // The team's own players, anyone borrowed for this fixture, and anyone already picked.
    const list = (players.data ?? []).filter(
      (p) => p.squad_id === squadId || slots.includes(p.user_id) || !!status.get(p.user_id)?.borrowed_from,
    );
    const rank = { in: 0, injured: 1, waiting: 2, out: 3 } as const;
    return list
      .map((p): Candidate => {
        const r = status.get(p.user_id);
        const injuredOut = !!p.injury_description && !p.injury_can_play;
        const st: Candidate['status'] = isNew
          ? injuredOut
            ? 'injured'
            : undefined
          : injuredOut
            ? 'injured'
            : r?.is_available === true
              ? 'in'
              : r?.is_available === false
                ? 'out'
                : 'waiting';
        const note = r?.borrowed_from ? `Playing up from ${r.borrowed_from}` : (r?.reason ?? null);
        return { user_id: p.user_id, first_name: p.first_name, surname: p.surname, form: p.form, status: st, note };
      })
      .sort((a, b) => (rank[a.status ?? 'waiting'] - rank[b.status ?? 'waiting']) || (b.form ?? -1) - (a.form ?? -1));
  }, [players.data, replies.data, squadId, slots, isNew]);

  const save = useMutation({
    mutationFn: (v: { leaguePosition: number | null }) =>
      saveFixture({
        fixtureId,
        squadId: squadId!,
        opponentName: form.opponentName,
        fixtureDate: form.date,
        startTime: form.time,
        location: form.location,
        isHome: form.isHome === 'home',
        leaguePosition: v.leaguePosition,
        notes: form.notes,
        players:
          isNew || teamTouched
            ? slots.flatMap((uid, i) => (uid ? [{ user_id: uid, pair_number: Math.floor(i / 2) + 1, selection_order: (i % 2) + 1 }] : []))
            : null,
      }),
    onSuccess: async (savedId) => {
      const fee = parsePounds(form.fee);
      const before = initialForm.fee ? parsePounds(initialForm.fee) : null;
      const id = fixtureId ?? savedId;
      if (id && (isNew ? fee != null : fee !== before)) {
        await setFixtureFee(id, fee).catch((e) => Alert.alert('Fixture saved, but not the match fee', errorMessage(e)));
      }
      await refresh();
      router.back();
      // An away venue we haven't saved yet: offer to add it to the venue book.
      if (form.isHome === 'away' && form.location.trim() && !venueFor(form.opponentName, venues.data)) {
        Alert.alert('Save this venue?', `Remember ${form.location.trim()} for future fixtures against ${form.opponentName.trim()}.`, [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Save',
            onPress: () =>
              saveVenue({ clubId: club.id, userId, name: form.opponentName, address: form.location, notes: '' }).catch((e) =>
                Alert.alert('Couldn’t save the venue', errorMessage(e)),
              ),
          },
        ]);
      }
    },
    onError: (e) => Alert.alert('Couldn’t save fixture', errorMessage(e)),
  });

  function submit() {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const e: FieldErrors = {};
      for (const issue of parsed.error.issues) e[issue.path[0] as keyof FieldErrors] ??= issue.message;
      setErrors(e);
      return;
    }
    setErrors({});
    const picked = slots.filter(Boolean) as string[];
    const unavailable = candidates.filter((p) => picked.includes(p.user_id) && (p.status === 'out' || p.status === 'injured'));
    const go = () => save.mutate({ leaguePosition: form.leaguePosition.trim() ? Number(form.leaguePosition) : null });
    if (unavailable.length) {
      Alert.alert(
        'Pick unavailable players?',
        `${unavailable.map((p) => p.first_name).join(', ')} said they can’t play or are injured.`,
        [
          { text: 'Go back', style: 'cancel' },
          { text: 'Save anyway', onPress: go },
        ],
      );
    } else {
      go();
    }
  }

  function applyRecommended() {
    const s = emptySlots();
    for (const r of recommended.data ?? []) s[(r.pair_number - 1) * 2 + (r.selection_order - 1)] = r.user_id;
    setSlots(s);
    setTeamTouched(true);
  }

  const set = <K extends keyof typeof form>(k: K) => (v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Screen footer={<Button title={isNew ? 'Add fixture' : 'Save changes'} onPress={submit} loading={save.isPending} />}>
      <Stack.Screen options={{ title: isNew ? 'New fixture' : 'Edit fixture' }} />

      <TextField
        label="Opponent"
        value={form.opponentName}
        onChangeText={(name) => {
          const pos = leaguePositionFor(name, league.data);
          setForm((f) => {
            // Fill the position from the table, but never overwrite one the captain typed.
            if (pos != null && (f.leaguePosition === '' || autoPosition)) return { ...f, opponentName: name, leaguePosition: String(pos) };
            if (pos == null && autoPosition) return { ...f, opponentName: name, leaguePosition: '' };
            return { ...f, opponentName: name };
          });
          setAutoPosition(pos != null && (form.leaguePosition === '' || autoPosition));
          fillVenue(name, form.isHome);
        }}
        placeholder="e.g. Hillside LTC 2"
        error={errors.opponentName}
        maxLength={100}
      />
      <Segmented
        value={form.isHome}
        onChange={(v) => {
          set('isHome')(v);
          fillVenue(form.opponentName, v);
        }}
        options={[
          { value: 'home', label: 'Home' },
          { value: 'away', label: 'Away' },
        ]}
      />
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <DateField label="Date" value={form.date} onChange={set('date')} minimumDate={isNew ? new Date() : undefined} />
        <TimeField label="Start" value={form.time} onChange={set('time')} />
      </View>
      <TextField
        label="Venue"
        value={form.location}
        onChangeText={(v) => {
          setAutoVenue(false);
          set('location')(v);
        }}
        placeholder="Club name or address"
        error={errors.location}
        maxLength={200}
        hint={venue ? `From the venue book${venue.notes ? `: ${venue.notes}` : ''}` : undefined}
      />
      <TextField
        label="Their league position (optional)"
        value={form.leaguePosition}
        onChangeText={(v) => {
          setAutoPosition(false);
          set('leaguePosition')(v);
        }}
        keyboardType="number-pad"
        error={errors.leaguePosition}
        hint={autoPosition ? 'Filled in from the league table' : 'Used to weight form by opponent strength'}
      />
      <TextField
        label="Match fee per player in £ (optional)"
        value={form.fee}
        onChangeText={set('fee')}
        keyboardType="decimal-pad"
        placeholder="e.g. 5"
        error={errors.fee}
        hint="Players in the team see what they owe; you tick off payments on the fixture"
      />
      <TextField label="Notes (optional)" value={form.notes} onChangeText={set('notes')} multiline maxLength={1000} error={errors.notes} />

      <SectionHeader title="Team" />
      {!isNew && (recommended.data ?? []).length > 0 ? (
        <Card style={{ backgroundColor: c.accentSoft }}>
          <Text variant="bodyBold" color="accent">
            Recommended team
          </Text>
          <Text variant="small" color="textMuted" style={{ marginBottom: space.md }}>
            Based on form, available players and partnerships. Only an aid – you decide.
          </Text>
          {[1, 2].map((pair) => (
            <View key={pair} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
              <Text variant="caption" color="accent" style={{ width: 52 }}>
                PAIR {pair}
              </Text>
              {(recommended.data ?? [])
                .filter((r) => r.pair_number === pair)
                .map((r) => (
                  <View key={r.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, backgroundColor: c.surface, padding: 6, borderRadius: radius.sm }}>
                    <Avatar userId={r.user_id} first={r.first_name} surname={r.surname} size={24} />
                    <Text variant="small" numberOfLines={1} style={{ flex: 1 }}>
                      {r.first_name} {r.surname.charAt(0)}.
                    </Text>
                    <Text variant="caption" color="textMuted">
                      {formatForm(r.form)}
                    </Text>
                  </View>
                ))}
            </View>
          ))}
          <Button title="Use this team" icon="sparkles-outline" size="sm" onPress={applyRecommended} />
        </Card>
      ) : (
        <Text variant="small" color="textMuted">
          {isNew
            ? 'You can pick a team now, or save first and come back once players have replied. You’ll get a recommended team then.'
            : 'A recommended team appears once at least 4 available players have a form score.'}
        </Text>
      )}

      <PairPicker
        candidates={candidates}
        value={slots}
        onChange={(v) => {
          setSlots(v);
          setTeamTouched(true);
        }}
      />
    </Screen>
  );
}
