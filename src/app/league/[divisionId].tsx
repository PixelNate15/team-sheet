import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Fragment, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Chip, EmptyState, ErrorState, Loading } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { canManageDivision, fetchDivisions, fetchLeagueTable, saveLeagueTable } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { fullDate } from '@/lib/format';
import { confirm, useRefreshAll } from '@/lib/hooks';
import type { LeagueRowInput } from '@/lib/types';
import { font, radius, space, useTheme } from '@/theme';

/** A row being edited; numbers are kept as text until saving. */
interface DraftRow {
  key: string;
  team_name: string;
  played: string;
  points: string;
  is_own_team: boolean;
}

let nextKey = 0;
const newKey = () => `row-${nextKey++}`;

/**
 * A division's league table for the current season. Everyone in the club can
 * read it; captains in the division and club admins can edit it. Saving also
 * updates the opponent's league position on upcoming fixtures (used by the
 * form score).
 */
export default function LeagueTable() {
  const { divisionId } = useLocalSearchParams<{ divisionId: string }>();
  const id = Number(divisionId);
  const { c } = useTheme();
  const { club } = useSignedIn();
  const refreshAll = useRefreshAll();

  const table = useQuery({ queryKey: ['leagueTable', id], queryFn: () => fetchLeagueTable(id) });
  const canEdit = useQuery({ queryKey: ['canManageDivision', id], queryFn: () => canManageDivision(id) });
  const divisions = useQuery({ queryKey: ['divisions', club.id], queryFn: () => fetchDivisions(club.id) });
  const division = divisions.data?.find((d) => d.id === id);

  const [draft, setDraft] = useState<DraftRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (rows: LeagueRowInput[]) => saveLeagueTable(id, rows),
    onSuccess: async (updated) => {
      setDraft(null);
      await refreshAll();
      Alert.alert(
        'League table saved',
        updated === 0
          ? 'No upcoming fixtures needed their league position changing.'
          : `Updated the league position on ${updated} upcoming fixture${updated === 1 ? '' : 's'}.`,
      );
    },
    onError: (e) => setError(errorMessage(e)),
  });

  if (table.isPending) return <Loading />;
  if (table.error) {
    return (
      <Screen>
        <ErrorState error={table.error} onRetry={() => table.refetch()} />
      </Screen>
    );
  }

  const rows = table.data ?? [];
  const title = division ? division.name : 'League table';

  function startEditing() {
    setError(null);
    setDraft(
      rows.length
        ? rows.map((r) => ({
            key: newKey(),
            team_name: r.team_name,
            played: String(r.played),
            points: String(r.points),
            is_own_team: r.is_own_team,
          }))
        : [{ key: newKey(), team_name: '', played: '0', points: '0', is_own_team: true }],
    );
  }

  function update(key: string, patch: Partial<DraftRow>) {
    setDraft((d) => d?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? null);
  }

  function move(index: number, by: -1 | 1) {
    setDraft((d) => {
      if (!d) return d;
      const to = index + by;
      if (to < 0 || to >= d.length) return d;
      const next = [...d];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }

  function submit() {
    if (!draft) return;
    const names = draft.map((r) => r.team_name.trim());
    if (names.some((n) => !n)) return setError('Every row needs a team name.');
    const lower = names.map((n) => n.toLowerCase());
    if (new Set(lower).size !== lower.length) return setError('Each team can only appear once.');
    setError(null);
    save.mutate(
      draft.map((r) => ({
        team_name: r.team_name.trim(),
        played: Math.max(0, parseInt(r.played, 10) || 0),
        points: parseInt(r.points, 10) || 0,
        is_own_team: r.is_own_team,
      })),
    );
  }

  async function cancel() {
    if (await confirm('Discard changes?', 'Your edits to the table won’t be saved.', 'Discard')) {
      setDraft(null);
      setError(null);
    }
  }

  // ------------------------------------------------------------ edit mode
  if (draft) {
    return (
      <Screen
        footer={
          <View style={{ gap: space.sm }}>
            {error ? (
              <Text variant="small" color="danger" align="center">
                {error}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button title="Cancel" variant="ghost" style={{ flex: 1 }} onPress={cancel} />
              <Button title="Save table" style={{ flex: 2 }} loading={save.isPending} onPress={submit} />
            </View>
          </View>
        }>
        <Stack.Screen options={{ title: `Edit ${title}` }} />
        <Text variant="small" color="textMuted">
          Put teams in table order, top first. Use the arrows to move a team. Tap the star to mark your own team. Team names
          should match how they’re typed on fixtures, so their league position can be filled in automatically.
        </Text>

        {draft.map((r, i) => (
          <Card key={r.key}>
            <View style={{ gap: space.sm }}>
              <View style={styles.editRow}>
                <Text variant="heading" color="textMuted" style={styles.pos}>
                  {i + 1}
                </Text>
                <TextInput
                  value={r.team_name}
                  onChangeText={(v) => update(r.key, { team_name: v })}
                  placeholder="Team name"
                  placeholderTextColor={c.textFaint}
                  accessibilityLabel={`Team name, position ${i + 1}`}
                  style={[styles.input, { flex: 1, color: c.text, backgroundColor: c.surfaceAlt }]}
                />
                <IconButton
                  icon={r.is_own_team ? 'star' : 'star-outline'}
                  color={r.is_own_team ? c.warning : c.textFaint}
                  label={r.is_own_team ? 'Your team (tap to unmark)' : 'Mark as your team'}
                  onPress={() => update(r.key, { is_own_team: !r.is_own_team })}
                />
              </View>
              <View style={styles.editRow}>
                <View style={styles.pos} />
                <NumberInput label="Played" value={r.played} onChange={(v) => update(r.key, { played: v })} />
                <NumberInput label="Points" value={r.points} onChange={(v) => update(r.key, { points: v })} allowNegative />
                <View style={{ flex: 1 }} />
                <IconButton icon="arrow-up" label="Move up" disabled={i === 0} onPress={() => move(i, -1)} />
                <IconButton icon="arrow-down" label="Move down" disabled={i === draft.length - 1} onPress={() => move(i, 1)} />
                <IconButton
                  icon="trash-outline"
                  color={c.danger}
                  label="Remove team"
                  onPress={() => setDraft((d) => d?.filter((x) => x.key !== r.key) ?? null)}
                />
              </View>
            </View>
          </Card>
        ))}

        <Button
          title="Add team"
          icon="add"
          variant="secondary"
          disabled={draft.length >= 40}
          onPress={() => setDraft((d) => [...(d ?? []), { key: newKey(), team_name: '', played: '0', points: '0', is_own_team: false }])}
        />
      </Screen>
    );
  }

  // ------------------------------------------------------------ view mode
  const lastUpdated = rows.reduce<string | null>((latest, r) => (!latest || r.updated_at > latest ? r.updated_at : latest), null);

  return (
    <Screen onRefresh={() => Promise.all([table.refetch(), canEdit.refetch()])}>
      <Stack.Screen options={{ title }} />
      {rows.length === 0 ? (
        <EmptyState
          icon="podium-outline"
          title="No table yet"
          message={canEdit.data ? 'Add the division’s teams to keep opponents’ league positions up to date.' : 'Your captain hasn’t added this season’s table yet.'}
        />
      ) : (
        <Card padded={false}>
          <View style={[styles.tableRow, styles.tableHead]}>
            <Text variant="caption" color="textMuted" style={styles.pos}>
              #
            </Text>
            <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
              TEAM
            </Text>
            <Text variant="caption" color="textMuted" style={styles.num}>
              P
            </Text>
            <Text variant="caption" color="textMuted" style={styles.num}>
              PTS
            </Text>
          </View>
          {rows.map((r) => (
            <Fragment key={r.position}>
              <View style={[styles.divider, { backgroundColor: c.border }]} />
              <View style={[styles.tableRow, r.is_own_team && { backgroundColor: c.accentSoft }]}>
                <Text variant="bodyBold" color="textMuted" style={styles.pos}>
                  {r.position}
                </Text>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Text variant={r.is_own_team ? 'bodyBold' : 'body'} numberOfLines={1} style={{ flexShrink: 1 }}>
                    {r.team_name}
                  </Text>
                  {r.is_own_team ? <Chip label="Us" tone="accent" /> : null}
                </View>
                <Text variant="body" color="textMuted" style={styles.num}>
                  {r.played}
                </Text>
                <Text variant="bodyBold" style={styles.num}>
                  {r.points}
                </Text>
              </View>
            </Fragment>
          ))}
        </Card>
      )}
      {lastUpdated ? (
        <Text variant="small" color="textFaint" align="center">
          Updated {fullDate(lastUpdated.slice(0, 10))}
        </Text>
      ) : null}
      {canEdit.data ? (
        <Button title={rows.length ? 'Edit table' : 'Add table'} icon="create-outline" onPress={startEditing} />
      ) : null}
    </Screen>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  color,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.iconButton, { opacity: disabled ? 0.3 : pressed ? 0.5 : 1 }]}>
      <Ionicons name={icon} size={20} color={color ?? c.accent} />
    </Pressable>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  allowNegative,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allowNegative?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <TextInput
        value={value}
        onChangeText={(v) => onChange(v.replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, '').slice(0, 5))}
        keyboardType={allowNegative ? 'numbers-and-punctuation' : 'number-pad'}
        selectTextOnFocus
        accessibilityLabel={label}
        style={[styles.input, styles.numberInput, { color: c.text, backgroundColor: c.surfaceAlt }]}
      />
      <Text variant="caption" color="textMuted">
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pos: { width: 28, textAlign: 'center' },
  num: { width: 44, textAlign: 'right' },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md },
  tableHead: { paddingVertical: space.sm },
  divider: { height: StyleSheet.hairlineWidth },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: { minHeight: 44, borderRadius: radius.sm, paddingHorizontal: space.md, fontSize: 16, fontFamily: font.body },
  numberInput: { width: 64, textAlign: 'center' },
  iconButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
