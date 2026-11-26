import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { deleteMessage, fetchMessages, fetchPollVotes, postMessage, votePoll } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { markChatRead } from '@/lib/chat-read';
import { errorMessage } from '@/lib/errors';
import { confirm } from '@/lib/hooks';
import { pollPercents, tallyPoll, type PollVote } from '@/lib/polls';
import type { ChatMessage } from '@/lib/types';
import { font, radius, space, useTheme } from '@/theme';

import { Avatar, EmptyState, ErrorState, Loading } from './Bits';
import { Button } from './Button';
import { Text } from './Text';

/**
 * Chat for the whole club (no fixtureId) or one fixture. Notices are pinned at
 * the top and notify people: the squad for a fixture notice (captains), the
 * whole club for a club notice (admins). Anyone can post and create polls.
 */
export function Chat({ fixtureId = null, canPostNotice }: { fixtureId?: number | null; canPostNotice: boolean }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { userId, club, isAdmin } = useSignedIn();
  const [body, setBody] = useState('');
  const [asNotice, setAsNotice] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[] | null>(null);
  const list = useRef<ComponentRef<typeof FlatList<ChatMessage>>>(null);
  const key = ['messages', club.id, fixtureId] as const;

  const messages = useQuery({
    queryKey: key,
    queryFn: () => fetchMessages(club.id, fixtureId),
    refetchInterval: 8000, // keep the conversation fresh while the screen is open
  });
  const pollIds = (messages.data ?? []).filter((m) => m.poll).map((m) => m.id);
  const votes = useQuery({
    queryKey: ['pollVotes', club.id, fixtureId, pollIds.join(',')],
    queryFn: () => fetchPollVotes(pollIds),
    enabled: pollIds.length > 0,
    refetchInterval: 8000,
  });

  // Opening the chat counts as reading it (for the unread dot on Home).
  const latest = messages.data?.[messages.data.length - 1]?.created_at;
  useEffect(() => {
    if (latest) markChatRead(club.id, fixtureId, latest);
  }, [latest, club.id, fixtureId]);

  const send = useMutation({
    mutationFn: () => {
      const options = pollOptions?.map((o) => o.trim()).filter(Boolean) ?? null;
      if (pollOptions && (!options || options.length < 2)) throw new Error('Add at least two options to the poll.');
      return postMessage({ clubId: club.id, fixtureId, userId, body, isNotice: canPostNotice && asNotice, pollOptions: options });
    },
    onSuccess: async () => {
      setBody('');
      setAsNotice(false);
      setPollOptions(null);
      await qc.invalidateQueries({ queryKey: key });
      setTimeout(() => list.current?.scrollToEnd({ animated: true }), 200);
    },
    onError: (e) => Alert.alert('Couldn’t send', errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteMessage(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e) => Alert.alert('Couldn’t delete', errorMessage(e)),
  });

  const vote = useMutation({
    mutationFn: (v: { messageId: number; option: number | null }) => votePoll(v.messageId, v.option),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pollVotes', club.id, fixtureId] }),
    onError: (e) => Alert.alert('Couldn’t vote', errorMessage(e)),
  });

  if (messages.isPending) return <Loading />;
  if (messages.error) return <ErrorState error={messages.error} onRetry={() => messages.refetch()} />;

  const notices = (messages.data ?? []).filter((m) => m.is_notice);
  const chat = (messages.data ?? []).filter((m) => !m.is_notice);
  const canDelete = (m: ChatMessage) => m.user_id === userId || isAdmin || (fixtureId != null && canPostNotice);

  const askDelete = async (m: ChatMessage) => {
    if (!canDelete(m)) return;
    if (await confirm('Delete this message?', 'It will be removed for everyone.')) remove.mutate(m.id);
  };

  const renderPoll = (m: ChatMessage, onDark: boolean) => {
    const options = m.poll!.options;
    const t = tallyPoll(m.id, options.length, votes.data ?? ([] as PollVote[]), userId);
    const pct = pollPercents(t);
    return (
      <View style={{ gap: 6, marginTop: 4 }}>
        {options.map((o, i) => {
          const chosen = t.mine === i;
          return (
            <Pressable
              key={`${m.id}-${i}`}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen }}
              accessibilityLabel={`${o}, ${t.counts[i]} vote${t.counts[i] === 1 ? '' : 's'}${chosen ? ', your vote' : ''}`}
              onPress={() => vote.mutate({ messageId: m.id, option: chosen ? null : i })}
              style={[styles.option, { borderColor: chosen ? (onDark ? c.onAccent : c.accent) : onDark ? c.onAccent : c.outline }]}>
              <View style={[styles.optionFill, { width: `${pct[i]}%`, backgroundColor: onDark ? 'rgba(255,255,255,0.18)' : c.accentSoft }]} />
              <Text variant={chosen ? 'smallBold' : 'small'} style={{ color: onDark ? c.onAccent : c.text, flex: 1 }}>
                {chosen ? '✓ ' : ''}
                {o}
              </Text>
              <Text variant="smallBold" style={{ color: onDark ? c.onAccent : c.textMuted }}>
                {t.counts[i]}
              </Text>
            </Pressable>
          );
        })}
        <Text variant="caption" style={{ color: onDark ? c.onAccent : c.textMuted, opacity: 0.8 }}>
          {t.total} vote{t.total === 1 ? '' : 's'} · tap to vote{t.mine != null ? ', tap again to undo' : ''}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
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
                  {n.poll ? renderPoll(n, false) : null}
                </Pressable>
              ))}
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          <EmptyState icon="chatbubbles-outline" title="No messages yet"
            message={fixtureId == null ? 'Chat with everyone in the club.' : 'Sort out lifts, kit or timings with the team here.'} />
        }
        renderItem={({ item: m }) => {
          const mine = m.user_id === userId;
          return (
            <Pressable onLongPress={() => askDelete(m)}
              style={{ flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: space.sm }}>
              {!mine ? (
                <Avatar userId={m.user_id} first={m.author?.first_name ?? '?'} surname={m.author?.surname ?? ''} size={28} />
              ) : null}
              <View style={[styles.bubble, m.poll && styles.pollBubble, { backgroundColor: mine ? c.accent : c.surface, borderColor: mine ? c.accent : c.border }]}>
                {!mine ? (
                  <Text variant="caption" color="textMuted">
                    {m.author?.first_name ?? 'Someone'}
                  </Text>
                ) : null}
                <Text variant={m.poll ? 'bodyBold' : 'body'} style={{ color: mine ? c.onAccent : c.text }}>
                  {m.poll ? '📊 ' : ''}
                  {m.body}
                </Text>
                {m.poll ? renderPoll(m, mine) : null}
                <Text variant="caption" style={{ color: mine ? c.onAccent : c.textMuted, opacity: 0.8, alignSelf: 'flex-end' }}>
                  {when(m.created_at)}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />

      <View style={[styles.composer, { borderTopColor: c.border, backgroundColor: c.surface, paddingBottom: insets.bottom + space.sm }]}>
        {canPostNotice ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Switch value={asNotice} onValueChange={setAsNotice} trackColor={{ true: c.accent }} accessibilityLabel="Post as a notice" />
            <Text variant="small" color="textMuted" style={{ flex: 1 }}>
              {fixtureId == null ? 'Post as a club notice (pinned and sent to everyone)' : 'Post as a notice (pinned and sent to the squad)'}
            </Text>
          </View>
        ) : null}

        {pollOptions ? (
          <View style={{ gap: space.xs }}>
            {pollOptions.map((o, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <TextInput
                  value={o}
                  onChangeText={(t) => setPollOptions((p) => p!.map((x, j) => (j === i ? t : x)))}
                  placeholder={`Option ${i + 1}`}
                  placeholderTextColor={c.textFaint}
                  maxLength={60}
                  accessibilityLabel={`Poll option ${i + 1}`}
                  style={[styles.optionInput, { color: c.text, borderColor: c.outline, backgroundColor: c.background, fontFamily: font.body }]}
                />
                {pollOptions.length > 2 ? (
                  <Text variant="smallBold" color="danger" accessibilityRole="button"
                    onPress={() => setPollOptions((p) => p!.filter((_, j) => j !== i))}>
                    Remove
                  </Text>
                ) : null}
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: space.lg }}>
              {pollOptions.length < 6 ? (
                <Text variant="smallBold" color="accent" accessibilityRole="button" onPress={() => setPollOptions((p) => [...p!, ''])}>
                  + Add option
                </Text>
              ) : null}
              <Text variant="smallBold" color="textMuted" accessibilityRole="button" onPress={() => setPollOptions(null)}>
                Cancel poll
              </Text>
            </View>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
          {!pollOptions ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Create a poll" hitSlop={8}
              onPress={() => setPollOptions(['', ''])} style={[styles.pollButton, { borderColor: c.outline }]}>
              <Text variant="smallBold" color="accent">
                Poll
              </Text>
            </Pressable>
          ) : null}
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={pollOptions ? 'Ask a question…' : asNotice ? 'Write a notice…' : fixtureId == null ? 'Message the club…' : 'Message the team…'}
            placeholderTextColor={c.textFaint}
            multiline
            maxLength={1000}
            accessibilityLabel={pollOptions ? 'Poll question' : 'Message'}
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
  pollBubble: { minWidth: '62%' },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 8, overflow: 'hidden' },
  optionFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingTop: 11, paddingBottom: 11, fontSize: 16 },
  optionInput: { flex: 1, minHeight: 40, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: space.md, fontSize: 15 },
  pollButton: { minHeight: 44, borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center' },
});
