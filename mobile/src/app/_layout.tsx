import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';

import { UpdateBanner } from '@/components/app-updates';
import { ErrorBanner } from '@/components/error-banner';
import { AppProvider, useApp } from '@/data/store';
import { colors } from '@/theme';

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, primary: colors.green, text: colors.text, border: colors.border },
};

function Root() {
  const { hydrated } = useApp();
  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textSecondary }}>Загрузка…</Text>
      </View>
    );
  }
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
      <ErrorBanner />
      <UpdateBanner />
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <AppProvider>
        <StatusBar style="light" />
        <Root />
      </AppProvider>
    </ThemeProvider>
  );
}
