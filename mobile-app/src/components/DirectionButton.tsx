import { i18n } from '@lingui/core';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';

import { hitTargets, paletteForScheme, radii, spacing, typography } from '@/design/tokens';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useSettingsStore } from '@/state/settings-store';

export type Direction = 'english_to_wolof' | 'wolof_to_english';

export interface DirectionButtonProps {
  direction: Direction;
  pressed?: boolean;
  recording?: boolean;
  elapsedSec?: number;
  countdownSec?: number | null;
  disabled?: boolean;
  onPressIn?: () => void;
  onPressOut?: () => void;
}

const DIRECTION_LABEL_KEY: Record<Direction, string> = {
  english_to_wolof: 'direction.english_to_wolof',
  wolof_to_english: 'direction.wolof_to_english',
};

const DIRECTION_PRESS_KEY: Record<Direction, string> = {
  english_to_wolof: 'direction.press.english_to_wolof',
  wolof_to_english: 'direction.press.wolof_to_english',
};

export function DirectionButton(props: DirectionButtonProps) {
  const {
    direction,
    pressed = false,
    recording = false,
    elapsedSec = 0,
    countdownSec = null,
    disabled = false,
    onPressIn,
    onPressOut,
  } = props;

  const palette = paletteForScheme(useColorScheme());
  const pulse = useRef(new Animated.Value(0)).current;
  const tapMode = useSettingsStore((s) => s.tapMode);
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    // FR-032: skip the pulse loop entirely when reduce-motion is enabled; the
    // recording state is still conveyed by the background color + text hint.
    // (001-wolof-translate-mobile:T111)
    if (!recording || reduceMotion) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [recording, pulse, reduceMotion]);

  const pulseStyle = useMemo(
    () => ({
      transform: [
        {
          scale: pulse.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.04],
          }),
        },
      ],
      opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.85] }),
    }),
    [pulse],
  );

  const fireHaptic = () => {
    try {
      Haptics.selectionAsync();
    } catch {
      // Haptics not available on simulator — safe to ignore.
    }
  };

  // FR-028: in press-and-hold mode we wire onPressIn/onPressOut directly so
  // the recorder starts and stops with the physical press. In tap mode we
  // ignore the raw in/out events and drive the same callbacks from a discrete
  // onPress handler that toggles based on the caller's `recording` prop —
  // downstream pipeline actions (pressStart / pressRelease / runPipeline) stay
  // identical across both modes. (001-wolof-translate-mobile:T107)
  const handlePressIn = () => {
    if (disabled || tapMode) return;
    fireHaptic();
    onPressIn?.();
  };

  const handlePressOut = () => {
    if (disabled || tapMode) return;
    onPressOut?.();
  };

  const handlePress = () => {
    if (disabled || !tapMode) return;
    fireHaptic();
    if (recording) {
      onPressOut?.();
    } else {
      onPressIn?.();
    }
  };

  const title = i18n._(DIRECTION_LABEL_KEY[direction]);
  const hint = i18n._(DIRECTION_PRESS_KEY[direction]);
  const elapsedLabel = i18n._('recording.elapsed', { seconds: elapsedSec });
  const countdownLabel =
    countdownSec != null
      ? i18n._('recording.countdownHint', { seconds: countdownSec })
      : null;

  const isActive = recording || pressed;
  const backgroundColor = isActive ? palette.accentDeep : palette.accent;
  const textColor = palette.accentOn;

  // FR-025 accessibility strings — hint varies by input mode so VoiceOver
  // announces the correct gesture. The recording-state hint is a distinct
  // key so it translates cleanly without interpolation.
  // (001-wolof-translate-mobile:T108)
  const a11yLabel = i18n._('a11y.directionButton.label', { direction: title });
  const a11yHint = recording
    ? i18n._('a11y.directionButton.hint.stop')
    : tapMode
      ? i18n._('a11y.directionButton.hint.tap')
      : i18n._('a11y.directionButton.hint.press');

  return (
    <Animated.View style={[styles.outer, recording && !reduceMotion ? pulseStyle : null]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint={a11yHint}
        accessibilityState={{ disabled, busy: recording }}
        disabled={disabled}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed: isPressed }) => [
          styles.tile,
          {
            backgroundColor,
            borderColor: palette.border,
            opacity: disabled ? 0.5 : isPressed || isActive ? 0.95 : 1,
          },
        ]}
      >
        <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.hint, { color: textColor }]} numberOfLines={2}>
          {recording
            ? tapMode
              ? i18n._('recording.tapToStop')
              : i18n._('recording.releaseHint')
            : hint}
        </Text>
        {recording ? (
          <View style={styles.meta}>
            <Text style={[styles.metaText, { color: textColor }]}>{elapsedLabel}</Text>
            {countdownLabel ? (
              <Text style={[styles.metaText, { color: textColor }]}>{countdownLabel}</Text>
            ) : null}
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: '100%',
  },
  tile: {
    minHeight: hitTargets.minPrimary,
    width: '100%',
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  title: {
    fontFamily: typography.heading.fontFamily,
    fontWeight: typography.heading.fontWeight,
    fontSize: typography.heading.sizes.md,
    textAlign: 'center',
  },
  hint: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.sm,
    textAlign: 'center',
    opacity: 0.9,
  },
  meta: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    gap: spacing.md,
  },
  metaText: {
    fontFamily: typography.mono.fontFamily,
    fontSize: typography.mono.sizes.md,
  },
});

export default DirectionButton;
