import { i18n } from '@lingui/core';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';

import { paletteForScheme, radii, spacing, typography } from '@/design/tokens';

export type BackendStage =
  | 'queued'
  | 'normalizing'
  | 'transcribing'
  | 'translating'
  | 'generating_speech'
  | 'completed'
  | 'failed';

export interface StatusPillProps {
  stage: BackendStage | null;
  uploadProgress?: number | null;
}

const STAGE_LABEL_KEY: Record<BackendStage, string> = {
  queued: 'stage.queued',
  normalizing: 'stage.normalizing',
  transcribing: 'stage.transcribing',
  translating: 'stage.translating',
  generating_speech: 'stage.generating_speech',
  completed: 'stage.completed',
  failed: 'stage.failed',
};

export function StatusPill(props: StatusPillProps) {
  const { stage, uploadProgress } = props;
  const palette = paletteForScheme(useColorScheme());

  if (stage == null && uploadProgress == null) {
    return null;
  }

  const background =
    stage === 'completed'
      ? palette.success
      : stage === 'failed'
        ? palette.danger
        : palette.secondaryIndigo;
  const foreground = palette.accentOn;

  const label =
    stage != null
      ? i18n._(STAGE_LABEL_KEY[stage])
      : i18n._('stage.queued');

  const showProgress =
    uploadProgress != null && uploadProgress >= 0 && uploadProgress <= 1;

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={i18n._('a11y.statusPill')}
      style={[
        styles.pill,
        {
          backgroundColor: background,
          borderColor: palette.border,
        },
      ]}
    >
      <Text style={[styles.text, { color: foreground }]} numberOfLines={1}>
        {label}
        {showProgress ? `  ${Math.round(uploadProgress! * 100)}%` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  text: {
    fontFamily: typography.body.fontFamily,
    fontWeight: '600',
    fontSize: typography.body.sizes.sm,
  },
});

export default StatusPill;
