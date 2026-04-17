import { i18n } from '@lingui/core';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { defaultPlayer } from '@/audio/player';
import { AUDIO_DIR_URI, historyRepo } from '@/cache/history-repo';
import EmptyState from '@/components/EmptyState';
import HistoryRow, { type HistoryEntry } from '@/components/HistoryRow';
import { paletteForScheme, spacing } from '@/design/tokens';
import { log } from '@/utils/logger';

function entryToPlayableResult(entry: HistoryEntry) {
  // TTS-only entries (empty audioPath) replay through expo-speech; audio-backed
  // entries play the cached file offline (001-wolof-translate-mobile:T075c)
  const isTtsOnly = !entry.audioPath;
  const targetLanguage =
    entry.direction === 'english_to_wolof' ? ('wolof' as const) : ('english' as const);
  return {
    requestId: entry.requestId,
    direction: entry.direction,
    targetLanguage,
    transcribedText: entry.transcribedText,
    translatedText: entry.translatedText,
    outputMode: isTtsOnly
      ? ('text_only' as const)
      : entry.direction === 'english_to_wolof'
        ? ('wolof_audio' as const)
        : ('english_audio' as const),
    audioUrl: null,
    localAudioUri: isTtsOnly ? null : `${AUDIO_DIR_URI}${entry.audioPath}`,
    completedAtMs: entry.createdAtMs,
  };
}

export default function HistoryScreen() {
  const palette = paletteForScheme(useColorScheme());
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await historyRepo.list();
      setEntries(list);
    } catch (err) {
      log('error', 'history', 'list failed', { err: String(err) });
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      defaultPlayer.stop();
    };
  }, [refresh]);

  const handleReplay = useCallback((entry: HistoryEntry) => {
    void defaultPlayer.playResult(entryToPlayableResult(entry));
  }, []);

  const handleDelete = useCallback(
    async (entry: HistoryEntry) => {
      try {
        await historyRepo.delete(entry.id);
      } catch (err) {
        log('error', 'history', 'delete failed', { err: String(err) });
      }
      await refresh();
    },
    [refresh],
  );

  if (entries === null) {
    return <SafeAreaView style={[styles.safe, { backgroundColor: palette.base }]} />;
  }

  if (entries.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.base }]} edges={['top']}>
        <EmptyState />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.base }]} edges={['top']}>
      <FlatList
        data={entries}
        keyExtractor={(item) => String(item.id)}
        accessibilityLabel={i18n._('screen.history')}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        renderItem={({ item }) => (
          <HistoryRow entry={item} onReplay={handleReplay} onDelete={handleDelete} />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  listContent: {
    padding: spacing.xl,
    paddingTop: spacing.md,
  },
});
