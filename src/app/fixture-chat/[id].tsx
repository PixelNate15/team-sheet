import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, EmptyState, ErrorState, Loading } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { deleteFixtureMessage, fetchFixture, fetchFixtureMessages, postFixtureMessage } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { confirm } from '@/lib/hooks';
import type { FixtureMessage } from '@/lib/types';
import { font, radius, space, useTheme } from '@/theme';

/** Chat and captain's notices for one fixture. Notices are pinned at the top and pushed to the squad. */
export default function FixtureChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fixtureId = Number(id);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { userId, managedSquads } = useSignedIn();
  const [body, setBody] = useState('');
  const [asNotice, setAsNotice] = useState(false);
  const list = useRef<ComponentRef<typeof FlatList<FixtureMessage>>>(null);

  const fixture = useQuery({ queryKey: ['fixture', fixtureId], queryFn: () => fetchFixture(fixtureId) });
  const messages = useQuery({
    queryKey: ['fixtureMessages', fixtureId],
    queryFn: () => fetchFixtureMessages(fixtureId),
    refetchInterval: 8000, // keep the conversation fresh while the screen is open
  });
  const canManage = !!fixture.data && managedSquads.some((s) => s.id === fixture.data.squad_id);

  const send = useMutation({
    mutationFn: () => postFixtureMessage(fixtureId, userId, body, canManage && asNotice),
    onSuccess: async () => {
      setBody('');
      setAsNotice(false);
      await qc.invalidateQueries({ queryKey: ['fixtureMessages', fixtureId] });
      setTimeout(() => list.current?.scrollToEnd({ animated: true }), 200);
    },
    onError: (e) => Alert.alert('Couldn’t send', errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (messageId: number) => deleteFixtureMessage(messageId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fixtureMessages', fixtureId] }),
    onError: (e) => Alert.alert('Couldn’t delete', errorMessage(e)),
  });

  if (messages.isPending) return <Loading />;
  if (messages.error) return <ErrorState error={messages.error} onRetry={() => messages.refetch()} />;

  const notices = (messages.data ?? []).filter((m) => m.is_notice);
  const chat = (messages.data ?? []).filter((m) => !m.is_notice);
  const title = fixture.data ? `${fixture.data.is_home ? 'vs' : '@'} ${fixture.data.opponent_name}` : 'Chat';

  const askDelete = async (m: FixtureMessage) => {
    if (m.user_id !== userId && !canManage) return;
    if (await confirm('Delete this message?', 'It will be removed for everyone.')) remove.mutate(m.id);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <Stack.Screen options={{ title }} />
      <FlatList
        ref={list}
        data={chat}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1 }}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        keyboardDismissMode="interactive"
        ListHeaderComponent={
          notices.length ? (
            <View style={{ gap: space.sm, marginBottom: space.md }}>
              {notices.map((n) => (
                <Pressable key={n.id} onLongPress={() => askDelete(n)}
                  style={[styles.notice, { backgroundColor: c.heroBg, borderColor: c.heroLine }]}>
                  <Text variant="caption" style={{ color: c.onHeroMuted }}>
                    📌 NOTICE · {n.author?.first_name ?? 'Captain'} · {when(n.created_at)}
                  </Text>
                  <Text variant="body" style={{ color: c.onHero }}>
                    {n.body}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          <EmptyState icon="chatbubbles-outline" title="No messages yet"
            message="Sort out lifts, kit or timings with the team here." />
        }
        renderItem={({ item: m }) => {
          const mine = m.user_id === userId;
          return (
            <Pressable onLongPress={() => askDelete(m)}
              style={{ flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: space.sm }}>
              {!mine ? (
                <Avatar userId={m.user_id} first={m.author?.first_name ?? '?'} surname={m.author?.surname ?? ''} size={28} />
              ) : null}
              <View style={[styles.bubble, { backgroundColor: mine ? c.accent : c.surface, borderColor: mine ? c.accent : c.border }]}>
                {!mine ? (
                  <Text variant="caption" color="textMuted">
                    {m.author?.first_name ?? 'Someone'}
                  </Text>
                ) : null}
                <Text variant="body" style={{ color: mine ? c.onAccent : c.text }}>
                  {m.body}
                </Text>
                <Text variant="caption" style={{ color: mine ? c.onAccent : c.textMuted, opacity: 0.8, alignSelf: 'flex-end' }}>
                  {when(m.created_at)}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />

      <View style={[styles.composer, { borderTopColor: c.border, backgroundColor: c.surface, paddingBottom: insets.bottom + space.sm }]}>
        {canManage ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Switch value={asNotice} onValueChange={setAsNotice} trackColor={{ true: c.accent }} accessibilityLabel="Post as a notice" />
            <Text variant="small" color="textMuted" style={{ flex: 1 }}>
              Post as a notice (pinned and sent to the squad)
            </Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={asNotice ? 'Write a notice…' : 'Message the team…'}
            placeholderTextColor={c.textFaint}
            multiline
            maxLength={1000}
            accessibilityLabel="Message"
            style={[styles.input, { color: c.text, borderColor: c.outline, backgroundColor: c.background, fontFamily: font.body }]}
          />
          <Button title="Send" size="sm" full={false} disabled={!body.trim()} loading={send.isPending} onPress={() => send.mutate()} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/** "14:05" today, otherwise "Mon 25 Nov". */
function when(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  notice: { borderRadius: radius.md, borderWidth: 1, padding: space.md, gap: 4 },
  bubble: { maxWidth: '78%', borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.md, paddingVertical: space.sm, gap: 2 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingTop: 11, paddingBottom: 11, fontSize: 16 },
});
