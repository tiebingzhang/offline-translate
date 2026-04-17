import { i18n } from '@lingui/core';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';

import { paletteForScheme, spacing, typography } from '@/design/tokens';
import { stepLabel, type StepMessageKey } from '@/pipeline/step-label';
import type { PipelinePhase } from '@/pipeline/state-machine';
import { usePipelineStore } from '@/state/pipeline-store';

export type StepLabelKey = StepMessageKey;

export interface PipelineStatusBarViewProps {
  stepLabelKey: StepMessageKey;
  secondsLeft: number;
  visible: boolean;
  reduceMotion?: boolean;
}

export function PipelineStatusBarView(props: PipelineStatusBarViewProps) {
  const { stepLabelKey, secondsLeft, visible } = props;
  const palette = paletteForScheme(useColorScheme());

  if (!visible) return null;

  const clamped = Math.max(0, Math.floor(secondsLeft));
  const label = i18n._(stepLabelKey);
  const countdown = i18n._('step.countdown', { seconds: clamped });
  const a11y = i18n._('step.a11y', { label, seconds: clamped });

  return (
    <View
      testID="PipelineStatusBar"
      accessibilityRole="text"
      accessibilityLabel={a11y}
      pointerEvents="box-none"
      style={[
        styles.bar,
        {
          backgroundColor: palette.surfaceElevated,
          borderTopColor: palette.border,
        },
      ]}
    >
      <Text
        style={[styles.label, { color: palette.text }]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {label}
      </Text>
      <Text
        style={[styles.countdown, { color: palette.textMuted }]}
        numberOfLines={1}
      >
        {countdown}
      </Text>
    </View>
  );
}

const TERMINAL_PHASES: ReadonlySet<PipelinePhase> = new Set([
  'completed',
  'playing',
  'failed',
  'timed_out',
  'idle',
]);

export interface PipelineStatusBarMockProps {
  stepLabelKey: StepMessageKey;
  secondsLeft: number;
  visible: boolean;
}

export function PipelineStatusBarMock(props: PipelineStatusBarMockProps) {
  return <PipelineStatusBarView {...props} />;
}

export function PipelineStatusBar() {
  const phase = usePipelineStore((s) => s.phase);
  const backendStage = usePipelineStore((s) => s.backendStage);
  const direction = usePipelineStore((s) => s.direction);
  const timeoutAtMs = usePipelineStore((s) => s.timeoutAtMs);

  const [secondsLeft, setSecondsLeft] = useState(() =>
    deriveSecondsLeft(timeoutAtMs),
  );
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled) reduceMotionRef.current = enabled;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSecondsLeft(deriveSecondsLeft(timeoutAtMs));
    if (TERMINAL_PHASES.has(phase) || timeoutAtMs == null) {
      return;
    }
    const id = setInterval(() => {
      setSecondsLeft(deriveSecondsLeft(timeoutAtMs));
    }, 1000);
    return () => clearInterval(id);
  }, [phase, timeoutAtMs]);

  if (phase === 'idle') return null;

  const labelKey = stepLabel({ phase, backendStage, direction });

  return (
    <PipelineStatusBarView
      stepLabelKey={labelKey}
      secondsLeft={secondsLeft}
      visible={true}
    />
  );
}

function deriveSecondsLeft(timeoutAtMs: number | null): number {
  if (timeoutAtMs == null) return 0;
  return Math.max(0, Math.ceil((timeoutAtMs - Date.now()) / 1000));
}

export const BAR_HEIGHT = 48;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: BAR_HEIGHT,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  label: {
    flexShrink: 1,
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.md,
    fontWeight: '600',
  },
  countdown: {
    marginLeft: spacing.md,
    fontFamily: typography.mono.fontFamily,
    fontSize: typography.mono.sizes.md,
    fontVariant: ['tabular-nums'],
  },
});

export default PipelineStatusBar;
