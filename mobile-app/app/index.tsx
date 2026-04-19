import { Ionicons } from '@expo/vector-icons';
import { i18n } from '@lingui/core';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useCallback } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import DirectionButton, { type Direction } from '@/components/DirectionButton';
import MetadataGrid from '@/components/MetadataGrid';
import PipelineStatusBar, { BAR_HEIGHT } from '@/components/PipelineStatusBar';
import RetryBanner from '@/components/RetryBanner';
import StatusPill from '@/components/StatusPill';
import { paletteForScheme, radii, spacing, typography } from '@/design/tokens';
import { useRecorder } from '@/audio/recorder';
import { usePipelineStore } from '@/state/pipeline-store';

function useMicPermissionDeniedHandler() {
  return useCallback(() => {
    Alert.alert(
      i18n._('error.microphone_denied'),
      undefined,
      [
        { text: i18n._('action.discard'), style: 'cancel' },
        {
          text: i18n._('action.openSettings'),
          onPress: () => {
            void Linking.openSettings();
          },
        },
      ],
      { cancelable: true },
    );
  }, []);
}

export default function MainScreen() {
  const palette = paletteForScheme(useColorScheme());
  const router = useRouter();

  const phase = usePipelineStore((s) => s.phase);
  const direction = usePipelineStore((s) => s.direction);
  const backendStage = usePipelineStore((s) => s.backendStage);
  const result = usePipelineStore((s) => s.result);
  const error = usePipelineStore((s) => s.error);
  const recordedDurationSec = usePipelineStore((s) => s.recordedDurationSec);
  const uploadProgress = usePipelineStore((s) => s.uploadProgress);
  const uploadProgressVisible = usePipelineStore((s) => s.uploadProgressVisible);

  const pressStart = usePipelineStore((s) => s.pressStart);
  const pressRelease = usePipelineStore((s) => s.pressRelease);
  const pressReleaseTooShort = usePipelineStore((s) => s.pressReleaseTooShort);
  const discard = usePipelineStore((s) => s.discard);
  const retry = usePipelineStore((s) => s.retry);

  const onPermissionDenied = useMicPermissionDeniedHandler();

  const recorder = useRecorder({
    onPermissionDenied,
    onTooShort: pressReleaseTooShort,
    onAutoSubmit: (uri, durationSec) => {
      void pressRelease(uri, durationSec);
    },
  });

  const handlePressIn = (targetDirection: Direction) => {
    if (phase !== 'idle' && phase !== 'completed') return;
    if (phase === 'completed') {
      discard();
    }
    pressStart(targetDirection);
    void recorder.start();
  };

  const handlePressOut = async () => {
    if (recorder.status !== 'recording') return;
    const stopped = await recorder.stop();
    if (!stopped) {
      pressReleaseTooShort();
      return;
    }
    await pressRelease(stopped.uri, stopped.durationSec);
  };

  const isButtonRecording = (d: Direction) =>
    recorder.status === 'recording' && direction === d;

  const showRetry = phase === 'failed' || phase === 'timed_out';
  const showResult = phase === 'completed' || phase === 'playing';
  const statusStage =
    phase === 'uploading'
      ? 'queued'
      : phase === 'polling' || phase === 'retrying' || phase === 'playing'
        ? backendStage
        : phase === 'completed'
          ? 'completed'
          : phase === 'failed' || phase === 'timed_out'
            ? 'failed'
            : null;

  const barVisible = phase !== 'idle';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.base }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          barVisible ? { paddingBottom: BAR_HEIGHT + spacing.xxxl } : null,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: palette.text }]}>
            {i18n._('app.name')}
          </Text>
          <View style={styles.headerActions}>
            <StatusPill
              stage={statusStage}
              uploadProgress={
                phase === 'uploading' && uploadProgressVisible ? uploadProgress : null
              }
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={i18n._('a11y.openHistory')}
              onPress={() => router.push('/history')}
              style={({ pressed }) => [
                styles.historyIcon,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: palette.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Ionicons name="time-outline" size={22} color={palette.text} />
            </Pressable>
          </View>
        </View>

        <View style={styles.buttons}>
          <DirectionButton
            direction="english_to_wolof"
            recording={isButtonRecording('english_to_wolof')}
            elapsedSec={recorder.elapsedSec}
            countdownSec={
              isButtonRecording('english_to_wolof') ? recorder.countdownSec : null
            }
            disabled={phase !== 'idle' && phase !== 'recording' && phase !== 'completed'}
            onPressIn={() => handlePressIn('english_to_wolof')}
            onPressOut={handlePressOut}
          />
          <DirectionButton
            direction="wolof_to_english"
            recording={isButtonRecording('wolof_to_english')}
            elapsedSec={recorder.elapsedSec}
            countdownSec={
              isButtonRecording('wolof_to_english') ? recorder.countdownSec : null
            }
            disabled={phase !== 'idle' && phase !== 'recording' && phase !== 'completed'}
            onPressIn={() => handlePressIn('wolof_to_english')}
            onPressOut={handlePressOut}
          />
        </View>

        {recorder.status === 'recording' || recordedDurationSec > 0 ? (
          <MetadataGrid
            durationSec={
              recorder.status === 'recording' ? recorder.elapsedSec : recordedDurationSec
            }
            sampleRateHz={16_000}
            channels={1}
            direction={direction ?? 'english_to_wolof'}
          />
        ) : null}

        {showResult && result ? (
          <>
            <View
              style={[
                styles.textBlock,
                { backgroundColor: palette.surface, borderColor: palette.border },
              ]}
            >
              <Text style={[styles.textLabel, { color: palette.textMuted }]}>
                {i18n._('text.source')}
              </Text>
              <Text style={[styles.textBody, { color: palette.text }]}>
                {result.transcribedText}
              </Text>
            </View>
            <View
              style={[
                styles.textBlock,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: palette.border,
                },
              ]}
            >
              <Text style={[styles.textLabel, { color: palette.textMuted }]}>
                {i18n._('text.translation')}
              </Text>
              <Text style={[styles.textBody, { color: palette.text }]}>
                {result.translatedText}
              </Text>
            </View>
          </>
        ) : (
          <View
            style={[
              styles.textBlock,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.textLabel, { color: palette.textMuted }]}>
              {i18n._('text.translation')}
            </Text>
            <Text style={[styles.textBody, { color: palette.textMuted }]}>
              {i18n._('text.placeholder')}
            </Text>
          </View>
        )}

        {showRetry ? (
          <RetryBanner
            error={error}
            phase={phase as 'failed' | 'timed_out'}
            onRetry={() => {
              void retry();
            }}
            onDiscard={discard}
          />
        ) : null}
      </ScrollView>
      <View style={styles.barAnchor} pointerEvents="box-none">
        <PipelineStatusBar />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    padding: spacing.xl,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  historyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: typography.heading.fontFamily,
    fontWeight: typography.heading.fontWeight,
    fontSize: typography.heading.sizes.lg,
  },
  buttons: {
    gap: spacing.md,
  },
  textBlock: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  textLabel: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textBody: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.lg,
    lineHeight: 26,
  },
  barAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
