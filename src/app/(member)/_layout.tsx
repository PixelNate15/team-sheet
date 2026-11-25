import { useQuery } from '@tanstack/react-query';
import { NativeTabs } from 'expo-router/native-tabs';

import { fetchMyFixtures, fetchMyResults } from '@/lib/api';
import { feedbackToGive } from '@/lib/feedback';
import { useTheme } from '@/theme';

export default function MemberTabs() {
  const { c } = useTheme();
  const fixtures = useQuery({ queryKey: ['myFixtures'], queryFn: fetchMyFixtures });
  const results = useQuery({ queryKey: ['myResults'], queryFn: fetchMyResults });

  const needReply = fixtures.data?.filter((f) => f.is_available == null).length ?? 0;
  const needFeedback = feedbackToGive(results.data).length;

  return (
    <NativeTabs tintColor={c.accent} backgroundColor={c.surface} indicatorColor={c.accentSoft} badgeBackgroundColor={c.danger}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="fixtures">
        <NativeTabs.Trigger.Label>Fixtures</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
        <NativeTabs.Trigger.Badge hidden={needReply === 0}>{String(needReply)}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="results">
        <NativeTabs.Trigger.Label>Results</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'trophy', selected: 'trophy.fill' }} md="emoji_events" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="feedback">
        <NativeTabs.Trigger.Label>Feedback</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'star.bubble', selected: 'star.bubble.fill' }} md="reviews" />
        <NativeTabs.Trigger.Badge hidden={needFeedback === 0}>{String(needFeedback)}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="me">
        <NativeTabs.Trigger.Label>Me</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md="account_circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
