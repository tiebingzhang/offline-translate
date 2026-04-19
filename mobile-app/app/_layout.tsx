import { I18nProvider } from '@lingui/react';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { i18n } from '@/i18n';
import { pendingJobsRepo } from '@/cache/pending-jobs-repo';
import { usePipelineStore } from '@/state/pipeline-store';
import { useSettingsStore } from '@/state/settings-store';
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

// FR-014 + FR-016: block the first navigation until the settings-store has
// rehydrated dev-mode state + backend URL override from AsyncStorage. The
// zustand persist middleware drives rehydration asynchronously, so we gate
// the Stack render on hasHydrated() to prevent a flash of pre-hydration
// defaults (which could, e.g., fire a request to the build-time default URL
// before the override loads). (001-wolof-translate-mobile:T096)
function useSettingsRehydration(): boolean {
  const [hydrated, setHydrated] = useState<boolean>(() =>
    useSettingsStore.persist.hasHydrated(),
  );
  useEffect(() => {
    if (hydrated) return;
    const unsub = useSettingsStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });
    // Persist middleware rehydrates on construction, but if it already
    // finished before we subscribed, we'd miss the event — re-check on mount.
    // (001-wolof-translate-mobile:T096)
    if (useSettingsStore.persist.hasHydrated()) setHydrated(true);
    return () => {
      unsub();
    };
  }, [hydrated]);
  return hydrated;
}

export default function RootLayout() {
  useColdStartResume();
  const settingsReady = useSettingsRehydration();

  if (!settingsReady) {
    // Rendering null keeps the splash screen visible in native builds and
    // avoids a pre-hydration flash on web. This path is typically traversed
    // in a single frame on cold start. (001-wolof-translate-mobile:T096)
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  );
}
