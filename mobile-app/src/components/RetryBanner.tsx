import { i18n } from '@lingui/core';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import type { TranslationError, TranslationErrorKind } from '@/api/bff-client';
import { paletteForScheme, radii, spacing, typography, type Palette } from '@/design/tokens';

export interface RetryBannerProps {
  error: TranslationError | null;
  phase: 'failed' | 'timed_out';
  onRetry: () => void;
  onDiscard: () => void;
}

type BannerKey =
  | TranslationErrorKind
  | 'timed_out'
  | 'unknown';

interface KindStyle {
  background: (p: Palette) => string;
  border: (p: Palette) => string;
  foreground: (p: Palette) => string;
}

// Color tone per kind — warning ochre for transient/recoverable, danger deep
// for server/malformed. Drives the visual cue described in T076.
// (001-wolof-translate-mobile:T076)
const KIND_STYLE: Record<BannerKey, KindStyle> = {
  upload_failed: {
    background: (p) => p.warning,
    border: (p) => p.accentDeep,
    foreground: (p) => p.accentOn,
  },
  poll_failed: {
    background: (p) => p.warning,
    border: (p) => p.accentDeep,
    foreground: (p) => p.accentOn,
  },
  client_timeout: {
    background: (p) => p.warning,
    border: (p) => p.accentDeep,
    foreground: (p) => p.accentOn,
  },
  timed_out: {
    background: (p) => p.warning,
    border: (p) => p.accentDeep,
    foreground: (p) => p.accentOn,
  },
  server_failed: {
    background: (p) => p.danger,
    border: (p) => p.accentDeep,
    foreground: (p) => p.accentOn,
  },
  malformed_response: {
    background: (p) => p.secondaryTerracotta,
    border: (p) => p.accentDeep,
    foreground: (p) => p.accentOn,
  },
  unknown: {
    background: (p) => p.danger,
    border: (p) => p.accentDeep,
    foreground: (p) => p.accentOn,
  },
};

function resolveKey(error: TranslationError | null, phase: 'failed' | 'timed_out'): BannerKey {
  if (error?.kind) return error.kind;
  if (phase === 'timed_out') return 'timed_out';
  return 'unknown';
}

export function RetryBanner(props: RetryBannerProps) {
  const { error, phase, onRetry, onDiscard } = props;
  const palette = paletteForScheme(useColorScheme());

  const key = resolveKey(error, phase);
  const tone = KIND_STYLE[key];
  const titleKey = `error.title.${key}`;
  const messageKey = `error.${key}`;

  // FR-007/FR-018: only retryable kinds expose a Retry button. timed_out is
  // always retryable per FR-020. Non-retryable kinds promote Discard to primary.
  // (001-wolof-translate-mobile:T076)
  const canRetry = error?.retryable ?? phase === 'timed_out';

  const background = tone.background(palette);
  const border = tone.border(palette);
  const foreground = tone.foreground(palette);

  return (
    <View
      accessibilityLabel={i18n._('a11y.retryBanner.label')}
      accessibilityHint={i18n._('a11y.retryBanner.hint')}
      accessibilityRole="alert"
      testID={`RetryBanner.${key}`}
      style={[
        styles.container,
        { backgroundColor: background, borderColor: border },
      ]}
    >
      <Text
        testID="RetryBanner.title"
        style={[styles.title, { color: foreground }]}
      >
        {i18n._(titleKey)}
      </Text>
      <Text
        testID="RetryBanner.message"
        style={[styles.message, { color: foreground }]}
      >
        {i18n._(messageKey)}
      </Text>
      <View style={styles.actions}>
        {canRetry ? (
          <Pressable
            accessibilityRole="button"
            testID="RetryBanner.retry"
            onPress={onRetry}
            style={({ pressed }) => [
              styles.button,
              styles.primary,
              {
                backgroundColor: foreground,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.buttonText, { color: background }]}>
              {i18n._('action.retry')}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          testID="RetryBanner.discard"
          onPress={onDiscard}
          style={({ pressed }) => [
            styles.button,
            // When Retry is unavailable, Discard becomes the primary filled
            // action so the user always has an obvious next step.
            // (001-wolof-translate-mobile:T076)
            canRetry ? styles.secondary : styles.primary,
            canRetry
              ? { borderColor: foreground, opacity: pressed ? 0.7 : 1 }
              : {
                  backgroundColor: foreground,
                  opacity: pressed ? 0.85 : 1,
                },
          ]}
        >
          <Text
            style={[
              styles.buttonText,
              { color: canRetry ? foreground : background },
            ]}
          >
            {i18n._('action.discard')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    fontFamily: typography.heading.fontFamily,
    fontSize: typography.heading.sizes.sm,
    fontWeight: '600',
  },
  message: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.md,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  button: {
    flexGrow: 1,
    minHeight: 44,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {},
  secondary: {
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'transparent',
  },
  buttonText: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.md,
    fontWeight: '600',
  },
});

export default RetryBanner;
