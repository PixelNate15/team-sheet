import { View } from 'react-native';

import { fullDate } from '@/lib/format';
import type { Feedback } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';

import { Card } from './Card';
import { Text } from './Text';

function Bar({ label, value }: { label: string; value: number }) {
  const { c } = useTheme();
  const tone = value >= 7 ? c.success : value >= 4 ? c.accent : c.danger;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="small" color="textMuted">
          {label}
        </Text>
        <Text variant="smallBold">{value}/10</Text>
      </View>
      <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: c.surfaceAlt }}>
        <View style={{ width: `${value * 10}%`, height: 6, borderRadius: radius.pill, backgroundColor: tone }} />
      </View>
    </View>
  );
}

/** Partner feedback received (port of Reusable_Code/feedback_cards.py). Reviewer stays anonymous. */
export function FeedbackCard({ f, showFixture = true }: { f: Feedback; showFixture?: boolean }) {
  const fx = f.matches?.fixtures;
  return (
    <Card>
      {showFixture && fx ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.md }}>
          <Text variant="bodyBold">
            {fx.is_home ? 'vs' : '@'} {fx.opponent_name}
          </Text>
          <Text variant="small" color="textMuted">
            {f.matches?.match_date ? fullDate(f.matches.match_date) : ''}
          </Text>
        </View>
      ) : null}
      <View style={{ gap: space.sm }}>
        <Bar label="Overall" value={f.overall_rating} />
        <Bar label="Key moments" value={f.key_moments_rating} />
        <Bar label="Communication" value={f.communication_rating} />
      </View>
      {f.comments ? (
        <Text variant="body" color="textMuted" style={{ marginTop: space.md, fontStyle: 'italic' }}>
          “{f.comments}”
        </Text>
      ) : null}
    </Card>
  );
}
