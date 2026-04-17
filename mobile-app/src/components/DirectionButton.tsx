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

  useEffect(() => {
    if (!recording) {
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
  }, [recording, pulse]);

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

  const handlePressIn = () => {
    if (disabled) return;
    try {
      Haptics.selectionAsync();
    } catch {
      // Haptics not available on simulator — safe to ignore.
    }
    onPressIn?.();
  };

  const handlePressOut = () => {
    if (disabled) return;
    onPressOut?.();
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

  return (
    <Animated.View style={[styles.outer, recording ? pulseStyle : null]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={i18n._('a11y.directionButton')}
        accessibilityHint={hint}
        accessibilityState={{ disabled, busy: recording }}
        disabled={disabled}
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
          {recording ? i18n._('recording.releaseHint') : hint}
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
