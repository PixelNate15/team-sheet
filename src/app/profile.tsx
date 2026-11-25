import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Avatar } from '@/components/Bits';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { removeAvatar, updateProfile, uploadAvatar } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { pickProfilePhoto } from '@/lib/photo';
import { space } from '@/theme';

const NAME = /^[\p{L}][\p{L}' -]*$/u;

export default function ProfileScreen() {
  const { me, userId, session, refreshMe } = useSignedIn();
  const [first, setFirst] = useState(me.profile.first_name);
  const [surname, setSurname] = useState(me.profile.surname);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  const photo = useMutation({
    mutationFn: async (action: 'choose' | 'remove') => {
      if (action === 'remove') return removeAvatar(userId, me.profile.avatar_path);
      const jpeg = await pickProfilePhoto();
      if (jpeg) await uploadAvatar(userId, jpeg, me.profile.avatar_path);
    },
    onSuccess: async () => {
      await Promise.all([refreshMe(), qc.invalidateQueries({ queryKey: ['clubAvatars'] })]);
    },
    onError: (e) => Alert.alert('Couldn’t update your photo', errorMessage(e)),
  });

  const save = useMutation({
    mutationFn: () => updateProfile(userId, { first_name: first.trim(), surname: surname.trim() }),
    onSuccess: async () => {
      await refreshMe();
      router.back();
    },
    onError: (e) => Alert.alert('Couldn’t save', errorMessage(e)),
  });

  function submit() {
    if (!NAME.test(first.trim()) || !NAME.test(surname.trim()) || first.trim().length > 50 || surname.trim().length > 50) {
      setError('Names can use letters, spaces, hyphens and apostrophes (up to 50 characters).');
      return;
    }
    setError(null);
    save.mutate();
  }

  return (
    <Screen footer={<Button title="Save" onPress={submit} loading={save.isPending} />}>
      <View style={{ alignItems: 'center', gap: space.md }}>
        <Avatar userId={userId} first={me.profile.first_name} surname={me.profile.surname} size={96} />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button
            title={me.profile.avatar_path ? 'Change photo' : 'Add a photo'}
            icon="camera-outline"
            variant="secondary"
            size="sm"
            full={false}
            loading={photo.isPending && photo.variables === 'choose'}
            onPress={() => photo.mutate('choose')}
          />
          {me.profile.avatar_path ? (
            <Button
              title="Remove"
              variant="ghost"
              size="sm"
              full={false}
              loading={photo.isPending && photo.variables === 'remove'}
              onPress={() => photo.mutate('remove')}
            />
          ) : null}
        </View>
        <Text variant="small" color="textMuted" align="center">
          Your club sees your photo next to your name.
        </Text>
      </View>
      <TextField label="First name" value={first} onChangeText={setFirst} autoComplete="given-name" />
      <TextField label="Surname" value={surname} onChangeText={setSurname} autoComplete="family-name" error={error} />
      <Text variant="small" color="textMuted">
        Signed in as {session?.user.email}
      </Text>
    </Screen>
  );
}
