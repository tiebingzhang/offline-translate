import { i18n } from '@lingui/core';
import { createAudioPlayer } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';

import { paletteForScheme, radii, spacing, typography } from '@/design/tokens';
import { useDevLogStore, type DevLogEntry } from '@/state/dev-log-store';
import { usePipelineStore } from '@/state/pipeline-store';
import { useSettingsStore } from '@/state/settings-store';
import { log } from '@/utils/logger';

// Accepted audio MIME types for the file-picker trigger (FR-015b). m4a / wav
// are the two formats the backend ingest pipeline normalizes from. Keeping
// this list narrow avoids accidental selection of unsupported containers.
// (001-wolof-translate-mobile:T092)
const ACCEPTED_AUDIO_TYPES = [
  'audio/m4a',
  'audio/x-m4a',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
] as const;

// FR-015b default direction when launching a file-picked upload: matches the
// app's primary direction so the round-trip is immediately useful. Future
// work may expose a direction selector in the panel itself.
// (001-wolof-translate-mobile:T092)
const FILE_PICKER_DEFAULT_DIRECTION = 'english_to_wolof' as const;

// FR-015b fallback duration when the device doesn't surface one with the
// picked file. The pipeline uses this only for timeout budget arithmetic;
// picking a too-small value would curtail the budget, so we default to a
// conservative ceiling.
// (001-wolof-translate-mobile:T092)
const FILE_PICKER_FALLBACK_DURATION_SEC = 15;

function formatLogTimestamp(atMs: number): string {
  const d = new Date(atMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function isValidUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return true; // Empty is "clear override"
  try {
    // The URL constructor throws on malformed input; a valid http(s) URL
    // must at minimum have a protocol and host. (001-wolof-translate-mobile:T095)
    const u = new URL(trimmed);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export interface DevPanelSheetProps {
  readonly _mockOnly?: never;
}

export function DevPanelSheet(_props: DevPanelSheetProps = {}) {
  const palette = paletteForScheme(useColorScheme());

  // FR-014 / FR-015e source of truth. (001-wolof-translate-mobile:T095)
  const devModeEnabled = useSettingsStore((s) => s.devModeEnabled);
  const backendUrlOverride = useSettingsStore((s) => s.backendUrlOverride);
  const setDevModeEnabled = useSettingsStore((s) => s.setDevModeEnabled);
  const setBackendUrlOverride = useSettingsStore((s) => s.setBackendUrlOverride);

  // FR-015c: the last-seen JobState is surfaced verbatim.
  // (001-wolof-translate-mobile:T093)
  const lastJobState = usePipelineStore((s) => s.lastJobState);
  const capturedAudioUri = usePipelineStore((s) => s.capturedAudioUri);
  const uploadFromFile = usePipelineStore((s) => s.uploadFromFile);

  // FR-015d event log.
  // (001-wolof-translate-mobile:T094)
  const entries = useDevLogStore((s) => s.entries);
  const clearLog = useDevLogStore((s) => s.clear);

  // Controlled inputs for the URL editor so the Save button can validate
  // before persisting. (001-wolof-translate-mobile:T095)
  const [urlDraft, setUrlDraft] = useState<string>(backendUrlOverride ?? '');
  const [urlError, setUrlError] = useState<string | null>(null);

  // FR-015a preview — we construct a new expo-audio player on demand and
  // release it once playback ends. (001-wolof-translate-mobile:T091)
  const activePreviewPlayer = useRef<ReturnType<typeof createAudioPlayer> | null>(
    null,
  );

  const releasePreviewPlayer = useCallback(() => {
    const p = activePreviewPlayer.current;
    if (p) {
      try {
        // expo-audio surfaces either `release` (legacy) or `remove`;
        // calling both is safe because each is idempotent when the other
        // has already torn the native resource down.
        // (001-wolof-translate-mobile:T091)
        const rel = (p as unknown as { release?: () => void }).release;
        const rem = (p as unknown as { remove?: () => void }).remove;
        rel?.call(p);
        rem?.call(p);
      } catch {
        // Swallow teardown errors — we'd rather leak a native resource than
        // crash the panel. (001-wolof-translate-mobile:T091)
      }
      activePreviewPlayer.current = null;
    }
  }, []);

  const handlePreviewPress = useCallback(() => {
    if (!capturedAudioUri) return;
    releasePreviewPlayer();
    try {
      const player = createAudioPlayer(capturedAudioUri) as unknown as {
        play: () => void;
        addListener?: (
          event: string,
          fn: (status: { didJustFinish?: boolean }) => void,
        ) => { remove: () => void };
      };
      activePreviewPlayer.current = player as unknown as ReturnType<
        typeof createAudioPlayer
      >;
      // Auto-release when the clip finishes so repeated presses don't stack
      // native player instances. (001-wolof-translate-mobile:T091)
      player.addListener?.('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) releasePreviewPlayer();
      });
      player.play();
      log('info', 'dev-panel', 'preview play', { capturedAudioUri });
    } catch (err) {
      log('warn', 'dev-panel', 'preview failed', { err: String(err) });
    }
  }, [capturedAudioUri, releasePreviewPlayer]);

  const handleSaveUrl = useCallback(() => {
    const trimmed = urlDraft.trim();
    if (trimmed.length === 0) {
      setUrlError(null);
      setBackendUrlOverride(null);
      log('info', 'dev-panel', 'backendUrlOverride cleared');
      return;
    }
    if (!isValidUrl(trimmed)) {
      setUrlError(i18n._('devPanel.backendUrl.invalid'));
      return;
    }
    setUrlError(null);
    setBackendUrlOverride(trimmed);
    log('info', 'dev-panel', 'backendUrlOverride set', { url: trimmed });
  }, [setBackendUrlOverride, urlDraft]);

  const handleFilePickerPress = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...ACCEPTED_AUDIO_TYPES],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) {
        log('info', 'dev-panel', 'file picker cancelled');
        return;
      }
      const asset = result.assets[0]!;
      log('info', 'dev-panel', 'file picked', {
        uri: asset.uri,
        mimeType: asset.mimeType,
        size: asset.size,
      });
      await uploadFromFile(
        asset.uri,
        FILE_PICKER_DEFAULT_DIRECTION,
        FILE_PICKER_FALLBACK_DURATION_SEC,
      );
    } catch (err) {
      log('error', 'dev-panel', 'file picker failed', { err: String(err) });
    }
  }, [uploadFromFile]);

  const rawResponseText = useMemo<string>(() => {
    if (!lastJobState) return '';
    // Preserve whatever casing the wire uses — the JobState in pipeline-store
    // is already the camelCased client shape, so we pretty-print it as-is
    // (Constitution Principle II).
    // (001-wolof-translate-mobile:T093)
    return JSON.stringify(lastJobState, null, 2);
  }, [lastJobState]);

  const renderLogItem = ({ item }: { item: DevLogEntry }) => (
    <View
      style={[
        styles.logRow,
        { borderColor: palette.border, backgroundColor: palette.surface },
      ]}
    >
      <Text style={[styles.logMeta, { color: palette.textMuted }]}>
        {formatLogTimestamp(item.atMs)} · {item.level.toUpperCase()} · {item.tag}
      </Text>
      <Text style={[styles.logMessage, { color: palette.text }]}>
        {item.message}
      </Text>
    </View>
  );

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: palette.base }]}
      contentContainerStyle={styles.screenContent}
      testID="DevPanelSheet"
    >
      {/* Section 1 — Developer-mode switch (FR-014)
          (001-wolof-translate-mobile:T095) */}
      <View
        style={[
          styles.section,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.sectionHeader, { color: palette.text }]}>
          {i18n._('devPanel.section.mode')}
        </Text>
        <View style={styles.toggleRow}>
          <View style={styles.toggleLabelColumn}>
            <Text style={[styles.toggleTitle, { color: palette.text }]}>
              {i18n._('devPanel.mode.title')}
            </Text>
            <Text style={[styles.toggleHint, { color: palette.textMuted }]}>
              {i18n._('devPanel.mode.hint')}
            </Text>
          </View>
          <Switch
            accessibilityLabel={i18n._('devPanel.mode.title')}
            testID="DevPanelSheet.devModeSwitch"
            value={devModeEnabled}
            onValueChange={(next) => {
              setDevModeEnabled(next);
              log('info', 'dev-panel', `devModeEnabled=${next}`);
            }}
          />
        </View>
      </View>

      {/* Gated sections below: panels only render when dev-mode is on (FR-014).
          The toggle itself remains visible so the user can always turn it
          back on. (001-wolof-translate-mobile:T095) */}
      {devModeEnabled ? (
        <>
          {/* Section 2 — Backend URL override (FR-015e / FR-022)
              (001-wolof-translate-mobile:T095) */}
          <View
            style={[
              styles.section,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.sectionHeader, { color: palette.text }]}>
              {i18n._('devPanel.section.backendUrl')}
            </Text>
            <Text style={[styles.sectionHint, { color: palette.textMuted }]}>
              {i18n._('devPanel.backendUrl.hint')}
            </Text>
            <View style={styles.urlRow}>
              <TextInput
                accessibilityLabel={i18n._('devPanel.backendUrl.title')}
                testID="DevPanelSheet.backendUrlInput"
                style={[
                  styles.urlInput,
                  {
                    borderColor: urlError ? palette.danger : palette.border,
                    backgroundColor: palette.surfaceElevated,
                    color: palette.text,
                  },
                ]}
                placeholder="https://bff.example.com"
                placeholderTextColor={palette.textMuted}
                value={urlDraft}
                onChangeText={(next) => {
                  setUrlDraft(next);
                  if (urlError) setUrlError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable
              />
              <Pressable
                accessibilityRole="button"
                testID="DevPanelSheet.backendUrlSave"
                onPress={handleSaveUrl}
                style={({ pressed }) => [
                  styles.saveButton,
                  {
                    backgroundColor: palette.accent,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text
                  style={[styles.saveButtonText, { color: palette.accentOn }]}
                >
                  {i18n._('devPanel.backendUrl.save')}
                </Text>
              </Pressable>
            </View>
            {urlError ? (
              <Text
                testID="DevPanelSheet.backendUrlError"
                style={[styles.inlineError, { color: palette.danger }]}
              >
                {urlError}
              </Text>
            ) : null}
          </View>

          {/* Section 3 — Raw response (FR-015c)
              (001-wolof-translate-mobile:T093) */}
          <View
            style={[
              styles.section,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.sectionHeader, { color: palette.text }]}>
              {i18n._('devPanel.section.rawResponse')}
            </Text>
            <Text style={[styles.sectionHint, { color: palette.textMuted }]}>
              {i18n._('devPanel.rawResponse.hint')}
            </Text>
            <ScrollView
              horizontal
              testID="DevPanelSheet.rawResponseScroll"
              style={[
                styles.codeBlock,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: palette.border,
                },
              ]}
              contentContainerStyle={styles.codeBlockContent}
            >
              <Text
                testID="DevPanelSheet.rawResponseText"
                style={[styles.codeText, { color: palette.text }]}
              >
                {rawResponseText || i18n._('devPanel.rawResponse.empty')}
              </Text>
            </ScrollView>
          </View>

          {/* Section 4 — Event log (FR-015d)
              (001-wolof-translate-mobile:T094) */}
          <View
            style={[
              styles.section,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionHeader, { color: palette.text }]}>
                {i18n._('devPanel.section.eventLog')}
              </Text>
              <Pressable
                accessibilityRole="button"
                testID="DevPanelSheet.eventLogClear"
                onPress={() => {
                  clearLog();
                }}
                style={({ pressed }) => [
                  styles.clearButton,
                  {
                    borderColor: palette.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={[styles.clearButtonText, { color: palette.text }]}>
                  {i18n._('devPanel.eventLog.clear')}
                </Text>
              </Pressable>
            </View>
            <Text style={[styles.sectionHint, { color: palette.textMuted }]}>
              {i18n._('devPanel.eventLog.hint')}
            </Text>
            <FlatList
              testID="DevPanelSheet.eventLogList"
              data={entries}
              keyExtractor={(item) => String(item.seq)}
              renderItem={renderLogItem}
              ItemSeparatorComponent={() => <View style={styles.logSeparator} />}
              style={styles.logList}
              contentContainerStyle={styles.logListContent}
              scrollEnabled={false}
              ListEmptyComponent={() => (
                <Text
                  style={[styles.sectionHint, { color: palette.textMuted }]}
                  testID="DevPanelSheet.eventLogEmpty"
                >
                  {i18n._('devPanel.eventLog.empty')}
                </Text>
              )}
            />
          </View>

          {/* Section 5a — Captured-audio preview (FR-015a)
              (001-wolof-translate-mobile:T091) */}
          <View
            style={[
              styles.section,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.sectionHeader, { color: palette.text }]}>
              {i18n._('devPanel.section.preview')}
            </Text>
            <Text style={[styles.sectionHint, { color: palette.textMuted }]}>
              {i18n._('devPanel.preview.hint')}
            </Text>
            <Pressable
              accessibilityRole="button"
              testID="DevPanelSheet.previewTrigger"
              disabled={!capturedAudioUri}
              onPress={handlePreviewPress}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: capturedAudioUri
                    ? palette.accentDeep
                    : palette.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text
                style={[styles.primaryButtonText, { color: palette.accentOn }]}
              >
                {i18n._('devPanel.preview.trigger')}
              </Text>
            </Pressable>
          </View>

          {/* Section 5b — File picker (FR-015b)
              (001-wolof-translate-mobile:T092) */}
          <View
            style={[
              styles.section,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.sectionHeader, { color: palette.text }]}>
              {i18n._('devPanel.section.filePicker')}
            </Text>
            <Text style={[styles.sectionHint, { color: palette.textMuted }]}>
              {i18n._('devPanel.filePicker.hint')}
            </Text>
            <Pressable
              accessibilityRole="button"
              testID="DevPanelSheet.filePickerTrigger"
              onPress={() => {
                void handleFilePickerPress();
              }}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: palette.accentDeep,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text
                style={[styles.primaryButtonText, { color: palette.accentOn }]}
              >
                {i18n._('devPanel.filePicker.trigger')}
              </Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

export default DevPanelSheet;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  screenContent: {
    padding: spacing.xl,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  section: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionHeader: {
    fontFamily: typography.heading.fontFamily,
    fontSize: typography.heading.sizes.sm,
    fontWeight: typography.heading.fontWeight,
  },
  sectionHint: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.sm,
    lineHeight: 20,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  toggleLabelColumn: {
    flexShrink: 1,
    gap: spacing.xs,
  },
  toggleTitle: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.md,
    fontWeight: '600',
  },
  toggleHint: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.sm,
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  urlInput: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 44,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: typography.mono.fontFamily,
    fontSize: typography.mono.sizes.md,
  },
  saveButton: {
    minHeight: 44,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.md,
    fontWeight: '600',
  },
  inlineError: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.sm,
    marginTop: spacing.xs,
  },
  codeBlock: {
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.xs,
    maxHeight: 220,
  },
  codeBlockContent: {
    padding: spacing.md,
  },
  codeText: {
    fontFamily: typography.mono.fontFamily,
    fontSize: typography.mono.sizes.sm,
    lineHeight: 18,
  },
  clearButton: {
    minHeight: 32,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.sm,
    fontWeight: '600',
  },
  logList: {
    marginTop: spacing.xs,
  },
  logListContent: {
    gap: 0,
  },
  logSeparator: {
    height: spacing.xs,
  },
  logRow: {
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  logMeta: {
    fontFamily: typography.mono.fontFamily,
    fontSize: typography.mono.sizes.sm,
  },
  logMessage: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.sm,
    lineHeight: 20,
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  primaryButtonText: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.md,
    fontWeight: '600',
  },
});
