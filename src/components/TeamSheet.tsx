import { StyleSheet, View } from 'react-native';

import { fullName } from '@/lib/format';
import { radius, space, useTheme } from '@/theme';

import { Avatar } from './Bits';
import { Card } from './Card';
import { Text } from './Text';

interface Slot {
  user_id: string;
  pair_number: number;
  selection_order: number;
  first_name: string;
  surname: string;
}

/** Pair 1 / Pair 2 team sheet (replaces players_selected_for_fixture_table.py). */
export function TeamSheet({ players, highlight }: { players: Slot[]; highlight?: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.pairs}>
      {[1, 2].map((pair) => (
        <Card key={pair} style={{ flex: 1 }}>
          <Text variant="caption" color="accent">
            PAIR {pair}
          </Text>
          <View style={{ gap: space.md, marginTop: space.md }}>
            {[1, 2].map((order) => {
              const p = players.find((x) => x.pair_number === pair && x.selection_order === order);
              return p ? (
                <View key={order} style={styles.player}>
                  <Avatar userId={p.user_id} first={p.first_name} surname={p.surname} size={34} ring={p.user_id === highlight ? 'success' : undefined} />
                  <Text variant="smallBold" numberOfLines={2} style={{ flex: 1 }}>
                    {fullName(p)}
                  </Text>
                </View>
              ) : (
                <View key={order} style={styles.player}>
                  <View style={[styles.tbc, { borderColor: c.border }]} />
                  <Text variant="small" color="textFaint">
                    TBC
                  </Text>
                </View>
              );
            })}
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pairs: { flexDirection: 'row', gap: space.md },
  player: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  tbc: { width: 34, height: 34, borderRadius: radius.pill, borderWidth: 2, borderStyle: 'dashed' },
});
