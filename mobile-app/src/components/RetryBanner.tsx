import { i18n } from '@lingui/core';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import type { TranslationError } from '@/api/bff-client';
import { paletteForScheme, radii, spacing, typography } from '@/design/tokens';

export interface RetryBannerProps {
  error: TranslationError | null;
  phase: 'failed' | 'timed_out';
  onRetry: () => void;
  onDiscard: () => void;
}

const ERROR_KEY: Record<string, string> = {
  upload_failed: 'error.upload_failed',
  poll_failed: 'error.poll_failed',
  server_failed: 'error.server_failed',
  client_timeout: 'error.client_timeout',
  malformed_response: 'error.malformed_response',
};

export function RetryBanner(props: RetryBannerProps) {
  const { error, phase, onRetry, onDiscard } = props;
  const palette = paletteForScheme(useColorScheme());

  const messageKey =
    error?.kind && ERROR_KEY[error.kind]
      ? ERROR_KEY[error.kind]
      : phase === 'timed_out'
        ? 'error.timed_out'
        : 'error.unknown';

  const canRetry = error?.retryable ?? phase === 'timed_out';

  return (
    <View
      accessibilityLabel={i18n._('a11y.retryBanner')}
      accessibilityRole="alert"
      style={[
        styles.container,
        { backgroundColor: palette.danger, borderColor: palette.accentDeep },
      ]}
    >
      <Text style={[styles.message, { color: palette.accentOn }]}>
        {i18n._(messageKey)}
      </Text>
      <View style={styles.actions}>
        {canRetry ? (
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [
              styles.button,
              styles.primary,
              {
                backgroundColor: palette.accentOn,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.buttonText, { color: palette.danger }]}>
              {i18n._('action.retry')}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={onDiscard}
          style={({ pressed }) => [
            styles.button,
            styles.secondary,
            { borderColor: palette.accentOn, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.buttonText, { color: palette.accentOn }]}>
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
    gap: spacing.md,
  },
  message: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.md,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
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
