import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function AppLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="add" options={{ title: t('add.title') }} />
      <Stack.Screen name="scan" options={{ title: t('scan.title') }} />
      <Stack.Screen name="food/[id]" options={{ title: t('food.title') }} />
      <Stack.Screen name="food/new" options={{ title: t('newFood.title') }} />
      <Stack.Screen name="entry/[id]" options={{ title: t('entry.title') }} />
      <Stack.Screen name="profile" options={{ title: t('profile.title') }} />
    </Stack>
  );
}
