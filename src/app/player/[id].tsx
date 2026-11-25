import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Avatar, Chip, ErrorState, InfoRow, Loading, SectionHeader, Stat } from '@/components/Bits';
import { Card } from '@/components/Card';
import { LineChart } from '@/components/LineChart';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { PartnerStatsList } from '@/components/PartnerStats';
import { fetchClubPlayers, fetchFeedbackReceived, fetchFormHistory, fetchPartnerStats } from '@/lib/api';
import { formatForm, fullDate, fullName, parseDate } from '@/lib/format';
import { useRefreshAll } from '@/lib/hooks';
import { space } from '@/theme';

/** Port of captain_expanded_player_card.py: stats, form over 10 weeks and the last 10 partner ratings. */
export default function PlayerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const refresh = useRefreshAll();
  const players = useQuery({ queryKey: ['clubPlayers'], queryFn: fetchClubPlayers });
  const form = useQuery({ queryKey: ['formHistory', id], queryFn: () => fetchFormHistory(id) });
  const feedback = useQuery({ queryKey: ['feedbackReceived', id, 10], queryFn: () => fetchFeedbackReceived(id, 10) });
  const partners = useQuery({ queryKey: ['partnerStats', id], queryFn: () => fetchPartnerStats(id) });

  const p = players.data?.find((x) => x.user_id === id);
  if (players.isPending) return <Loading />;
  if (!p) {
    return (
      <Screen>
        <ErrorState error={players.error ?? new Error('Player not found')} onRetry={() => players.refetch()} />
      </Screen>
    );
  }

  const formPoints = (form.data ?? []).map((pt) => ({
    label: parseDate(pt.week_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric' }),
    value: pt.form == null ? null : Number(pt.form),
  }));
  const ratings = [...(feedback.data ?? [])].reverse();
  const series = (k: 'overall_rating' | 'key_moments_rating' | 'communication_rating') =>
    ratings.map((f, i) => ({ label: String(i + 1), value: f[k] }));

  return (
    <Screen onRefresh={refresh}>
      <Stack.Screen options={{ title: fullName(p) }} />
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Avatar userId={p.user_id} first={p.first_name} surname={p.surname} size={84} />
        <Text variant="title">{fullName(p)}</Text>
        <View style={{ flexDirection: 'row', gap: space.xs }}>
          {p.squad_name ? <Chip label={p.squad_name} tone="accent" /> : <Chip label="No team" />}
          {p.is_captain ? <Chip label="Captain" tone="success" /> : null}
          {p.injury_description ? <Chip label="Injured" tone="warning" icon="bandage-outline" /> : null}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Stat label="Form" value={formatForm(p.form)} tone="accent" />
        <Stat label="Win %" value={`${p.win_percentage}`} tone="success" />
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Stat label="Rubbers" value={String(p.games_played)} />
        <Stat label="Fixtures this season" value={String(p.fixtures_played_this_season)} />
      </View>

      <Card>
        <InfoRow icon="podium-outline" label="Division" value={p.division_name ?? '–'} />
        <InfoRow icon="calendar-outline" label="Last match" value={p.last_match_date ? fullDate(p.last_match_date) : 'Not played yet'} />
        <InfoRow
          icon="bandage-outline"
          label="Injury"
          value={p.injury_description ? `${p.injury_description}${p.injury_can_play ? ' (can play)' : ''}` : 'None'}
          last
        />
      </Card>

      <SectionHeader title="Partners" />
      {partners.error ? (
        <ErrorState error={partners.error} onRetry={() => partners.refetch()} />
      ) : partners.data ? (
        <PartnerStatsList
          stats={partners.data}
          onPressPartner={(pid) => router.push({ pathname: '/player/[id]', params: { id: pid } })}
        />
      ) : null}

      <SectionHeader title="Form over 10 weeks" />
      <Card>
        <LineChart points={formPoints} decimals={3} />
      </Card>

      <SectionHeader title="Partner ratings · last 10" />
      {(
        [
          ['Overall', 'overall_rating'],
          ['Key moments', 'key_moments_rating'],
          ['Communication', 'communication_rating'],
        ] as const
      ).map(([label, key]) => (
        <Card key={key}>
          <Text variant="bodyBold" style={{ marginBottom: space.sm }}>
            {label}
          </Text>
          <LineChart points={series(key)} min={0} max={10} height={120} decimals={0} />
        </Card>
      ))}
    </Screen>
  );
}
