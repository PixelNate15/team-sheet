import { Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, EmptyState } from '@/components/Bits';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import type { OpponentRecord, PartnerStat, SquadPairing } from '@/lib/types';
import { type Palette, space, useTheme } from '@/theme';

/** Green for a strong record, red for a weak one; the number itself is always shown too. */
function winTone(pct: number): keyof Palette {
  if (pct >= 60) return 'success';
  if (pct <= 40) return 'danger';
  return 'text';
}

function plural(n: number, word: string, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}

/** A card of rows separated by hairlines; rows are tappable when onPress is given. */
function RowList<T>({
  items,
  keyOf,
  render,
  onPress,
}: {
  items: T[];
  keyOf: (item: T) => string;
  render: (item: T) => ReactNode;
  onPress?: (item: T) => void;
}) {
  const { c } = useTheme();
  return (
    <Card padded={false}>
      {items.map((item, i) => (
        <Fragment key={keyOf(item)}>
          {i > 0 ? <View style={[styles.divider, { backgroundColor: c.border }]} /> : null}
          {onPress ? (
            <Pressable style={styles.row} onPress={() => onPress(item)} accessibilityRole="button">
              {render(item)}
            </Pressable>
          ) : (
            <View style={styles.row}>{render(item)}</View>
          )}
        </Fragment>
      ))}
    </Card>
  );
}

function WinPct({ pct }: { pct: number }) {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text variant="heading" color={winTone(pct)}>
        {Math.round(pct)}%
      </Text>
      <Text variant="caption" color="textMuted">
        WON
      </Text>
    </View>
  );
}

/** "How have I done with each partner?" for one player. */
export function PartnerStatsList({
  stats,
  onPressPartner,
  emptyMessage = 'Partnership stats appear once results are entered.',
}: {
  stats: PartnerStat[];
  onPressPartner?: (partnerId: string) => void;
  emptyMessage?: string;
}) {
  if (stats.length === 0) {
    return <EmptyState icon="people-outline" title="No partnerships yet" message={emptyMessage} />;
  }
  return (
    <RowList
      items={stats}
      keyOf={(s) => s.partner_id}
      onPress={onPressPartner ? (s) => onPressPartner(s.partner_id) : undefined}
      render={(s) => (
        <>
          <Avatar first={s.first_name} surname={s.surname} size={36} />
          <View style={{ flex: 1, gap: 1 }}>
            <Text variant="bodyBold" numberOfLines={1}>
              {s.first_name} {s.surname}
            </Text>
            <Text variant="small" color="textMuted">
              {plural(s.rubbers, 'rubber')} · W{s.wins} L{s.rubbers - s.wins} · games {s.games_won}–{s.games_lost}
            </Text>
          </View>
          <WinPct pct={s.win_percentage} />
        </>
      )}
    />
  );
}

/** The squad's pairs, strongest first (pairs with 2+ rubbers ranked above one-offs). */
export function PairingsList({ pairings, limit = 5 }: { pairings: SquadPairing[]; limit?: number }) {
  const { c } = useTheme();
  if (pairings.length === 0) {
    return <EmptyState icon="people-outline" title="No pairings yet" message="Best pairings appear once results are entered." />;
  }
  return (
    <RowList
      items={pairings.slice(0, limit)}
      keyOf={(p) => `${p.player_1_id}-${p.player_2_id}`}
      render={(p) => {
        const [f1, ...s1] = p.player_1_name.split(' ');
        const [f2, ...s2] = p.player_2_name.split(' ');
        return (
          <>
            <View style={{ flexDirection: 'row' }}>
              <Avatar first={f1} surname={s1.join(' ')} size={32} />
              <View style={{ marginLeft: -10, borderRadius: 18, borderWidth: 2, borderColor: c.surface }}>
                <Avatar first={f2} surname={s2.join(' ')} size={32} />
              </View>
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Text variant="bodyBold" numberOfLines={2}>
                {p.player_1_name} & {p.player_2_name}
              </Text>
              <Text variant="small" color="textMuted">
                {plural(p.rubbers, 'rubber')} · W{p.wins} L{p.rubbers - p.wins} · games {p.games_won}–{p.games_lost}
              </Text>
            </View>
            <WinPct pct={p.win_percentage} />
          </>
        );
      }}
    />
  );
}

/** Head-to-head record against each opponent club. */
export function OpponentRecordList({ records }: { records: OpponentRecord[] }) {
  if (records.length === 0) {
    return <EmptyState icon="flag-outline" title="No head-to-heads yet" message="Records against each club appear once results are entered." />;
  }
  return (
    <RowList
      items={records}
      keyOf={(r) => r.opponent_name.toLowerCase()}
      render={(r) => {
        const tone: keyof Palette = r.won > r.lost ? 'success' : r.won < r.lost ? 'danger' : 'textMuted';
        return (
          <>
            <View style={{ flex: 1, gap: 1 }}>
              <Text variant="bodyBold" numberOfLines={1}>
                {r.opponent_name}
              </Text>
              <Text variant="small" color="textMuted">
                {plural(r.played, 'match', 'matches')}
                {r.drawn ? ` · ${r.drawn} drawn` : ''} · rubbers {r.rubbers_won}–{r.rubbers_lost}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="heading" color={tone}>
                {r.won}–{r.lost}
              </Text>
              <Text variant="caption" color="textMuted">
                W–L
              </Text>
            </View>
          </>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: space.lg },
});
