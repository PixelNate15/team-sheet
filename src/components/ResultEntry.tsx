import { useMutation, useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { Chip, Loading, SectionHeader } from './Bits';
import { Button } from './Button';
import { Card } from './Card';
import { Segmented } from './Field';
import { emptySlots, PairPicker, type Candidate, type Slots } from './PairPicker';
import { Screen } from './Screen';
import { Text } from './Text';
import {
  fetchClubPlayers,
  fetchFixture,
  fetchFixtureMatches,
  fetchFixtureTeam,
  fetchResultSubmission,
  saveFixtureResult,
  submitResult,
} from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { longDate } from '@/lib/format';
import { useRefreshAll } from '@/lib/hooks';
import type { FixtureRow } from '@/lib/types';
import { evaluateRubber, RUBBERS, teamTotals, type RubberScore } from '@/lib/scoring';
import { font, radius, space, useTheme } from '@/theme';

const blank = (): RubberScore => ({ set1Won: null, set1Lost: null, set2Won: null, set2Lost: null, champTie: null });

/**
 * The result form. "save": the captain saves the result. "submit": a player in
 * the team sends the scores for the captain to check and save (src/app/send-result).
 */
export function ResultEntryScreen({ mode }: { mode: 'save' | 'submit' }) {
  const { fixtureId: raw } = useLocalSearchParams<{ fixtureId: string }>();
  const fixtureId = Number(raw);
  const submission = useQuery({ queryKey: ['resultSubmission', fixtureId], queryFn: () => fetchResultSubmission(fixtureId) });

  const fixture = useQuery({ queryKey: ['fixture', fixtureId], queryFn: () => fetchFixture(fixtureId) });
  const team = useQuery({ queryKey: ['fixtureTeam', fixtureId], queryFn: () => fetchFixtureTeam(fixtureId) });
  const matches = useQuery({ queryKey: ['matches', fixtureId], queryFn: () => fetchFixtureMatches(fixtureId) });

  if (fixture.isPending || team.isPending || matches.isPending || submission.isPending) return <Loading />;
  if (!fixture.data) return <Loading />;

  // Prefill from a saved result, otherwise from the team selection.
  const saved = matches.data ?? [];
  const initialSlots = emptySlots();
  let initialScores: RubberScore[] = [blank(), blank(), blank(), blank()];
  if (saved.length) {
    for (const m of saved.filter((x) => x.rubber_number <= 2)) {
      const ids = m.match_players.map((p) => p.user_id).sort();
      initialSlots[(m.pair_number - 1) * 2] = ids[0] ?? null;
      initialSlots[(m.pair_number - 1) * 2 + 1] = ids[1] ?? null;
    }
    initialScores = RUBBERS.map(({ rubber }) => {
      const m = saved.find((x) => x.rubber_number === rubber);
      return m
        ? { set1Won: m.set_1_won, set1Lost: m.set_1_lost, set2Won: m.set_2_won, set2Lost: m.set_2_lost, champTie: m.champ_tie }
        : blank();
    });
  } else if (submission.data) {
    // Scores a player has sent: start from those.
    const sent = submission.data.matches;
    for (const m of sent.filter((x) => x.rubber_number <= 2)) {
      initialSlots[(m.rubber_number - 1) * 2] = m.player_1;
      initialSlots[(m.rubber_number - 1) * 2 + 1] = m.player_2;
    }
    initialScores = RUBBERS.map(({ rubber }) => {
      const m = sent.find((x) => x.rubber_number === rubber);
      return m
        ? { set1Won: m.set_1_won, set1Lost: m.set_1_lost, set2Won: m.set_2_won, set2Lost: m.set_2_lost, champTie: m.champ_tie }
        : blank();
    });
  } else {
    for (const p of team.data ?? []) initialSlots[(p.pair_number - 1) * 2 + (p.selection_order - 1)] = p.user_id;
  }

  return (
    <ResultForm
      fixture={fixture.data}
      initialSlots={initialSlots}
      initialScores={initialScores}
      mode={mode}
      teamIds={(team.data ?? []).map((p) => p.user_id)}
      sentBy={submission.data && mode === 'save' && !saved.length ? (submission.data.submitter?.first_name ?? 'A player') : null}
    />
  );
}

function ResultForm({
  fixture: f,
  initialSlots,
  initialScores,
  mode,
  teamIds,
  sentBy,
}: {
  fixture: FixtureRow;
  initialSlots: Slots;
  initialScores: RubberScore[];
  mode: 'save' | 'submit';
  teamIds: string[];
  sentBy: string | null;
}) {
  const fixtureId = f.id;
  const refresh = useRefreshAll();
  const players = useQuery({ queryKey: ['clubPlayers'], queryFn: fetchClubPlayers });
  const [slots, setSlots] = useState<Slots>(initialSlots);
  const [scores, setScores] = useState<RubberScore[]>(initialScores);

  const candidates: Candidate[] = useMemo(
    () =>
      (players.data ?? [])
        // Players sending scores choose from the picked team; captains from the whole team.
        .filter((p) => (mode === 'submit' ? teamIds.includes(p.user_id) : p.squad_id === f.squad_id || slots.includes(p.user_id)))
        .map((p) => ({ user_id: p.user_id, first_name: p.first_name, surname: p.surname, form: p.form })),
    [players.data, f.squad_id, slots, mode, teamIds],
  );

  const outcomes = scores.map(evaluateRubber);
  const totals = teamTotals(scores);
  const pairsReady = slots.every(Boolean);
  const allComplete = outcomes.every((o) => o.complete);

  const save = useMutation({
    mutationFn: () =>
      (mode === 'submit' ? submitResult : saveFixtureResult)(
        fixtureId,
        RUBBERS.map(({ rubber, pair }, i) => ({
          rubber_number: rubber,
          player_1: slots[(pair - 1) * 2]!,
          player_2: slots[(pair - 1) * 2 + 1]!,
          set_1_won: scores[i].set1Won!,
          set_1_lost: scores[i].set1Lost!,
          set_2_won: scores[i].set2Won!,
          set_2_lost: scores[i].set2Lost!,
          champ_tie: outcomes[i].needsChampTie ? scores[i].champTie : null,
        })),
      ),
    onSuccess: async () => {
      await refresh();
      router.back();
      if (mode === 'submit') Alert.alert('Scores sent', 'Your captain will check them and save the result.');
    },
    onError: (e) => Alert.alert(mode === 'submit' ? 'Couldn’t send the scores' : 'Couldn’t save result', errorMessage(e)),
  });

  const setScore = (i: number, patch: Partial<RubberScore>) =>
    setScores((s) => s.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const name = (uid: string | null) => {
    const p = candidates.find((x) => x.user_id === uid);
    return p ? `${p.first_name} ${p.surname.charAt(0)}.` : '?';
  };

  return (
    <Screen
      footer={
        <Button
          title={
            allComplete && pairsReady
              ? `${mode === 'submit' ? 'Send to captain' : 'Save result'} · ${totals.setsWon}–${totals.setsLost}`
              : `Complete all 4 rubbers to ${mode === 'submit' ? 'send' : 'save'}`
          }
          disabled={!allComplete || !pairsReady}
          loading={save.isPending}
          onPress={() => save.mutate()}
        />
      }>
      <Stack.Screen options={{ title: `${f.is_home ? 'vs' : '@'} ${f.opponent_name}` }} />
      <Text variant="body" color="textMuted">
        {longDate(f.fixture_date)}
        {f.divisions?.name ? ` · ${f.divisions.name}` : ''}
      </Text>
      {sentBy ? (
        <Chip label={`Scores sent by ${sentBy}: check and save`} tone="accent" icon="checkmark-done" />
      ) : mode === 'submit' ? (
        <Text variant="small" color="textMuted">
          Enter the scores from the match. Your captain checks them before the result is saved.
        </Text>
      ) : null}

      <SectionHeader title="Who played" />
      <PairPicker candidates={candidates} value={slots} onChange={setSlots} />

      <SectionHeader title="Scores" />
      {RUBBERS.map(({ rubber, pair, opponentPair }, i) => {
        const o = outcomes[i];
        return (
          <Card key={rubber} accent={o.won == null ? undefined : o.won ? 'success' : 'danger'}>
            <View style={styles.rubberHead}>
              <View style={{ flex: 1 }}>
                <Text variant="caption" color="textMuted">
                  RUBBER {rubber} · OUR PAIR {pair} v THEIR PAIR {opponentPair}
                </Text>
                <Text variant="bodyBold">
                  {name(slots[(pair - 1) * 2])} & {name(slots[(pair - 1) * 2 + 1])}
                </Text>
              </View>
              {o.won != null ? <Chip label={o.won ? 'Won' : 'Lost'} tone={o.won ? 'success' : 'danger'} /> : null}
            </View>

            <View style={styles.sets}>
              <SetInput
                label="Set 1"
                won={scores[i].set1Won}
                lost={scores[i].set1Lost}
                onChange={(w, l) => setScore(i, { set1Won: w, set1Lost: l })}
              />
              <SetInput
                label="Set 2"
                won={scores[i].set2Won}
                lost={scores[i].set2Lost}
                onChange={(w, l) => setScore(i, { set2Won: w, set2Lost: l })}
              />
            </View>

            {o.needsChampTie ? (
              <View style={{ gap: space.xs, marginTop: space.md }}>
                <Text variant="smallBold" color="textMuted">
                  One set all – champions tie-break
                </Text>
                <Segmented
                  value={scores[i].champTie ?? ''}
                  onChange={(v) => setScore(i, { champTie: v === '' ? null : (v as 'W' | 'L') })}
                  options={[
                    { value: 'W', label: 'We won' },
                    { value: 'L', label: 'We lost' },
                  ]}
                />
              </View>
            ) : null}
            {o.error ? (
              <Text variant="small" color="danger" style={{ marginTop: space.sm }}>
                {o.error}
              </Text>
            ) : null}
          </Card>
        );
      })}

      <Card tone="soft">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="heading">Team total</Text>
          <Text variant="stat" color={totals.setsWon > totals.setsLost ? 'success' : totals.setsWon < totals.setsLost ? 'danger' : 'text'}>
            {totals.setsWon}–{totals.setsLost}
          </Text>
        </View>
        <Text variant="small" color="textMuted">
          Rubbers {totals.rubbersWon}–{totals.rubbersLost}
        </Text>
      </Card>
    </Screen>
  );
}

function SetInput({
  label,
  won,
  lost,
  onChange,
}: {
  label: string;
  won: number | null;
  lost: number | null;
  onChange: (won: number | null, lost: number | null) => void;
}) {
  const { c } = useTheme();
  const parse = (t: string) => {
    const d = t.replace(/\D/g, '').slice(-1);
    return d === '' ? null : Number(d);
  };
  const box = [styles.box, { backgroundColor: c.surfaceAlt, color: c.text }];
  return (
    <View style={{ flex: 1, gap: space.xs }}>
      <Text variant="caption" color="textMuted" align="center">
        {label.toUpperCase()}
      </Text>
      <View style={styles.setRow}>
        <TextInput
          accessibilityLabel={`${label} games won`}
          value={won == null ? '' : String(won)}
          onChangeText={(t) => onChange(parse(t), lost)}
          keyboardType="number-pad"
          maxLength={1}
          selectTextOnFocus
          placeholder="–"
          placeholderTextColor={c.textFaint}
          style={box}
        />
        <Text variant="heading" color="textFaint">
          –
        </Text>
        <TextInput
          accessibilityLabel={`${label} games lost`}
          value={lost == null ? '' : String(lost)}
          onChangeText={(t) => onChange(won, parse(t))}
          keyboardType="number-pad"
          maxLength={1}
          selectTextOnFocus
          placeholder="–"
          placeholderTextColor={c.textFaint}
          style={box}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rubberHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  sets: { flexDirection: 'row', gap: space.lg, marginTop: space.md },
  setRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  box: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    textAlign: 'center',
    fontSize: 24,
    fontFamily: font.display,
  },
});
