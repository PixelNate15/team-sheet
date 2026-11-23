import { View } from 'react-native';

import { formatForm, fullName } from '@/lib/format';
import type { ClubPlayer } from '@/lib/types';
import { space } from '@/theme';

import { Avatar, Chip } from './Bits';
import { Card } from './Card';
import { Text } from './Text';

/** Port of Reusable_Code/player_cards.py with form and injury added. */
export function PlayerCard({
  p,
  onPress,
  onLongPress,
  selected,
  showSquad,
}: {
  p: ClubPlayer;
  onPress?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  showSquad?: boolean;
}) {
  return (
    <Card onPress={onPress} onLongPress={onLongPress} selected={selected} accessibilityLabel={fullName(p)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Avatar first={p.first_name} surname={p.surname} size={48} ring={selected ? 'accent' : undefined} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text variant="bodyBold" numberOfLines={1}>
            {fullName(p)}
          </Text>
          <Text variant="small" color="textMuted">
            {p.games_played} played · {p.win_percentage}% won
            {showSquad ? ` · ${p.squad_name ?? 'No squad'}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }}>
            {p.is_captain ? <Chip label="Captain" tone="accent" /> : null}
            {p.injury_description ? (
              <Chip label={p.injury_can_play ? 'Injured · can play' : 'Injured'} tone="warning" icon="bandage-outline" />
            ) : null}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="heading" color={p.form == null ? 'textFaint' : 'accent'}>
            {formatForm(p.form)}
          </Text>
          <Text variant="caption" color="textFaint">
            FORM
          </Text>
        </View>
      </View>
    </Card>
  );
}
