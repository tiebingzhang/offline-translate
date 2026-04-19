import { i18n } from '@lingui/core';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { RectButton, Swipeable } from 'react-native-gesture-handler';

import type { Direction } from '@/api/bff-client';
import { hitTargets, paletteForScheme, radii, spacing, typography } from '@/design/tokens';
import { formatDate } from '@/utils/formatters';

export interface HistoryEntry {
  id: number;
  requestId: string;
  direction: Direction;
  transcribedText: string;
  translatedText: string;
  audioPath: string;
  audioByteSize: number;
  createdAtMs: number;
}

export interface HistoryRowProps {
  entry: HistoryEntry;
  onReplay: (entry: HistoryEntry) => void;
  onDelete: (entry: HistoryEntry) => void;
}

export function HistoryRow({ entry, onReplay, onDelete }: HistoryRowProps) {
  const palette = paletteForScheme(useColorScheme());
  const directionLabel = i18n._(`direction.${entry.direction}`);

  // FR-025 — VoiceOver hears direction + createdAt timestamp so users can
  // distinguish entries. FR-036 — timestamp is rendered via the shared
  // locale-aware formatter.
  // (001-wolof-translate-mobile:T108, T119a)
  const timestamp = formatDate(entry.createdAtMs);
  const a11yLabel = i18n._('a11y.historyRow.label', {
    direction: directionLabel,
    timestamp,
    source: entry.transcribedText,
    target: entry.translatedText,
  });

  const renderRightActions = () => (
    <RectButton
      accessibilityRole="button"
      accessibilityLabel={i18n._('history.a11y.delete')}
      style={[styles.deleteAction, { backgroundColor: palette.danger }]}
      onPress={() => onDelete(entry)}
    >
      <Text style={[styles.deleteLabel, { color: palette.accentOn }]}>
        {i18n._('history.delete')}
      </Text>
    </RectButton>
  );

  return (
    <Swipeable
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={renderRightActions}
    >
      <View
        style={[
          styles.row,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
        accessible
        accessibilityRole="summary"
        accessibilityLabel={a11yLabel}
      >
        <View style={styles.body}>
          <View
            style={[
              styles.badge,
              { borderColor: palette.border, backgroundColor: palette.surfaceElevated },
            ]}
          >
            <Text style={[styles.badgeText, { color: palette.textMuted }]} numberOfLines={1}>
              {directionLabel}
            </Text>
          </View>

          <Text style={[styles.sourceLabel, { color: palette.textMuted }]}>
            {i18n._('text.source')}
          </Text>
          <Text style={[styles.sourceText, { color: palette.text }]} numberOfLines={2}>
            {entry.transcribedText}
          </Text>

          <Text style={[styles.targetLabel, { color: palette.textMuted }]}>
            {i18n._('text.translation')}
          </Text>
          <Text style={[styles.targetText, { color: palette.text }]} numberOfLines={3}>
            {entry.translatedText}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={i18n._('history.a11y.replay')}
          onPress={() => onReplay(entry)}
          style={({ pressed }) => [
            styles.replayButton,
            {
              backgroundColor: palette.accent,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[styles.replayText, { color: palette.accentOn }]}>
            {i18n._('history.replay')}
          </Text>
        </Pressable>
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: {
    flex: 1,
    gap: spacing.xs,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.xs,
  },
  badgeText: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.xs,
    letterSpacing: 0.3,
  },
  sourceLabel: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sourceText: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.md,
    lineHeight: 22,
  },
  targetLabel: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.xs,
  },
  targetText: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.md,
    lineHeight: 22,
  },
  replayButton: {
    minHeight: hitTargets.minSecondary,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replayText: {
    fontFamily: typography.body.fontFamily,
    fontWeight: '600',
    fontSize: typography.body.sizes.md,
  },
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    borderRadius: radii.md,
    marginLeft: spacing.xs,
  },
  deleteLabel: {
    fontFamily: typography.body.fontFamily,
    fontWeight: '600',
    fontSize: typography.body.sizes.md,
  },
});

export default HistoryRow;
