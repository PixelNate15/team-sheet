import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { updateProfile } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';

const NAME = /^[\p{L}][\p{L}' -]*$/u;

export default function ProfileScreen() {
  const { me, userId, session, refreshMe } = useSignedIn();
  const [first, setFirst] = useState(me.profile.first_name);
  const [surname, setSurname] = useState(me.profile.surname);
  const [error, setError] = useState<string | null>(null);

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
      <TextField label="First name" value={first} onChangeText={setFirst} autoComplete="given-name" />
      <TextField label="Surname" value={surname} onChangeText={setSurname} autoComplete="family-name" error={error} />
      <Text variant="small" color="textMuted">
        Signed in as {session?.user.email}
      </Text>
    </Screen>
  );
}
