import { i18n } from '@lingui/core';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';

import { paletteForScheme, spacing, typography } from '@/design/tokens';

export interface EmptyStateProps {
  messageKey?: string;
}

export function EmptyState({ messageKey = 'history.empty' }: EmptyStateProps) {
  const palette = paletteForScheme(useColorScheme());
  return (
    <View style={styles.container} accessible accessibilityRole="text">
      <Text style={[styles.message, { color: palette.textMuted }]}>
        {i18n._(messageKey)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxxl,
  },
  message: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.lg,
    lineHeight: 26,
    textAlign: 'center',
  },
});

export default EmptyState;
