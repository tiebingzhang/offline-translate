import { I18nProvider } from '@lingui/react';
import { Stack } from 'expo-router';

import { i18n } from '@/i18n';

export default function RootLayout() {
  return (
    <I18nProvider i18n={i18n}>
      <Stack>
        <Stack.Screen name="index" options={{ title: i18n._('screen.main') }} />
        <Stack.Screen name="history" options={{ title: i18n._('screen.history') }} />
        <Stack.Screen
          name="settings"
          options={{
            presentation: 'modal',
            title: i18n._('screen.settings'),
            sheetAllowedDetents: [0.5, 1],
          }}
        />
        <Stack.Screen
          name="dev-panel"
          options={{
            presentation: 'modal',
            title: i18n._('screen.devPanel'),
            sheetAllowedDetents: [0.5, 1],
          }}
        />
      </Stack>
    </I18nProvider>
  );
}
