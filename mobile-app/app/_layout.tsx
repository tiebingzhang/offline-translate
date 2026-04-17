import { I18nProvider } from '@lingui/react';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { i18n } from '@/i18n';
import { pendingJobsRepo } from '@/cache/pending-jobs-repo';
import { usePipelineStore } from '@/state/pipeline-store';
import { log } from '@/utils/logger';

function useColdStartResume(): void {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { live, expired } = await pendingJobsRepo.resumeAll(Date.now());
        if (cancelled) return;
        if (expired.length > 0) {
          log('warn', 'pipeline', 'pruned expired pending jobs', {
            count: expired.length,
          });
        }
        const [first] = live;
        if (first) {
          await usePipelineStore.getState().resumePendingJob(first);
        }
      } catch (err) {
        log('error', 'pipeline', 'cold-start resume failed', { err: String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}

export default function RootLayout() {
  useColdStartResume();

  return (
    <SafeAreaProvider>
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
    </SafeAreaProvider>
  );
}
