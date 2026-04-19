import { i18n } from '@lingui/core';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';

import { paletteForScheme, radii, spacing, typography } from '@/design/tokens';
import { formatNumber } from '@/utils/formatters';

import type { Direction } from './DirectionButton';

export interface MetadataGridProps {
  durationSec: number;
  sampleRateHz: number;
  channels: 1 | 2;
  direction: Direction;
}

const DIRECTION_LABEL_KEY: Record<Direction, string> = {
  english_to_wolof: 'direction.english_to_wolof',
  wolof_to_english: 'direction.wolof_to_english',
};

export function MetadataGrid(props: MetadataGridProps) {
  const { durationSec, sampleRateHz, channels, direction } = props;
  const palette = paletteForScheme(useColorScheme());

  // FR-036 — locale-aware number formatting for the duration (1 decimal) and
  // integer sample rate; the i18n templates still provide the unit suffixes.
  // (001-wolof-translate-mobile:T119a)
  const durationRounded = Math.round(durationSec * 10) / 10;
  const cells: Array<{ label: string; value: string }> = [
    {
      label: i18n._('metadata.duration'),
      value: i18n._('metadata.durationValue', {
        seconds: formatNumber(durationRounded),
      }),
    },
    {
      label: i18n._('metadata.sampleRate'),
      value: i18n._('metadata.sampleRateValue', { hz: formatNumber(sampleRateHz) }),
    },
    {
      label: i18n._('metadata.channels'),
      value: i18n._(channels === 1 ? 'metadata.channelsMono' : 'metadata.channelsStereo'),
    },
    {
      label: i18n._('metadata.direction'),
      value: i18n._(DIRECTION_LABEL_KEY[direction]),
    },
  ];

  return (
    <View
      accessibilityLabel={i18n._('a11y.metadataGrid')}
      style={[
        styles.grid,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      {cells.map((cell) => (
        <View key={cell.label} style={styles.cell}>
          <Text style={[styles.label, { color: palette.textMuted }]} numberOfLines={1}>
            {cell.label}
          </Text>
          <Text style={[styles.value, { color: palette.text }]} numberOfLines={1}>
            {cell.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    width: '100%',
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
    columnGap: spacing.sm,
  },
  cell: {
    flexBasis: '48%',
    flexGrow: 1,
    gap: 2,
  },
  label: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.md,
    fontWeight: '600',
  },
});

export default MetadataGrid;
