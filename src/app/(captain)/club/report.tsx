import { useMutation, useQuery } from '@tanstack/react-query';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { EmptyState, SectionHeader, Skeleton, Stat } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Segmented } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { fetchSeasonAwards, fetchSeasonReport, fetchSeasons } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { formatPence } from '@/lib/format';
import { seasonReportHtml } from '@/lib/report';
import { space } from '@/theme';

/** Season report for the teams you manage: a quick summary here, and a PDF to share. */
export default function ReportScreen() {
  const { club } = useSignedIn();
  const seasons = useQuery({ queryKey: ['seasons', club.id], queryFn: () => fetchSeasons(club.id) });
  const [picked, setPicked] = useState<number | null>(null);
  const seasonId = picked ?? seasons.data?.find((s) => s.is_current)?.id ?? seasons.data?.[0]?.id ?? null;

  const report = useQuery({
    queryKey: ['seasonReport', seasonId],
    queryFn: () => fetchSeasonReport(seasonId!),
    enabled: seasonId != null,
  });

  const awards = useQuery({
    queryKey: ['seasonAwards', seasonId],
    queryFn: () => fetchSeasonAwards(seasonId!),
    enabled: seasonId != null,
  });

  const share = useMutation({
    mutationFn: async () => {
      const { uri } = await Print.printToFileAsync({ html: seasonReportHtml(report.data!, awards.data ?? []) });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Season report' });
      } else {
        await Print.printAsync({ uri });
      }
    },
    onError: (e) => Alert.alert('Couldn’t create the report', errorMessage(e)),
  });

  if (seasons.isPending) return <Screen><Skeleton count={3} /></Screen>;
  if ((seasons.data ?? []).length === 0) {
    return (
      <Screen>
        <EmptyState icon="document-text-outline" title="No seasons yet" message="A club admin can add one under Seasons & divisions." />
      </Screen>
    );
  }

  const recent = (seasons.data ?? []).slice(0, 3);

  return (
    <Screen>
      {recent.length > 1 ? (
        <Segmented
          value={String(seasonId)}
          onChange={(v) => setPicked(Number(v))}
          options={recent.map((s) => ({ value: String(s.id), label: s.name }))}
        />
      ) : null}

      {report.isPending ? (
        <Skeleton count={2} height={120} />
      ) : report.error ? (
        <EmptyState icon="alert-circle-outline" title="Couldn’t load the report" message={errorMessage(report.error)} />
      ) : (
        <>
          {report.data!.squads.map((s) => {
            const played = s.fixtures.filter((f) => f.sets_won != null);
            const won = played.filter((f) => (f.sets_won ?? 0) > (f.sets_lost ?? 0)).length;
            const top = s.players[0];
            return (
              <View key={s.name} style={{ gap: space.sm }}>
                <SectionHeader title={s.division ? `${s.name} · ${s.division}` : s.name} />
                <Card>
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    <Stat label="Played" value={String(played.length)} style={{ flex: 1 }} />
                    <Stat label="Won" value={String(won)} tone="success" style={{ flex: 1 }} />
                    <Stat label="Lost" value={String(played.length - won)} style={{ flex: 1 }} />
                  </View>
                  {s.fees_outstanding_pence ? (
                    <Text variant="small" color="textMuted" style={{ marginTop: space.md }}>
                      Fees outstanding {formatPence(s.fees_outstanding_pence)}
                    </Text>
                  ) : null}
                  {(awards.data?.find((a) => a.squad === s.name)?.awards ?? []).length ? (
                    <View style={{ gap: space.sm, marginTop: space.md }}>
                      <Text variant="caption" color="textMuted">
                        AWARDS
                      </Text>
                      {awards.data!.find((a) => a.squad === s.name)!.awards.map((a) => (
                        <View key={a.title} style={{ flexDirection: 'row', gap: space.sm }}>
                          <Text variant="smallBold" color="accent" style={{ width: 130 }}>
                            🏆 {a.title}
                          </Text>
                          <View style={{ flex: 1 }}>
                            <Text variant="smallBold">{a.winner}</Text>
                            <Text variant="small" color="textMuted">
                              {a.detail}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : top ? null : (
                    <Text variant="small" color="textMuted" style={{ marginTop: space.md }}>
                      No rubbers played yet.
                    </Text>
                  )}
                </Card>
              </View>
            );
          })}
          <Button title="Create PDF to share" icon="share-outline" loading={share.isPending} onPress={() => share.mutate()} />
          <Text variant="small" color="textMuted">
            The PDF lists every fixture and result, and each player’s rubbers, wins, win % and form. Captains see their own
            teams; club admins see every team.
          </Text>
        </>
      )}
    </Screen>
  );
}
