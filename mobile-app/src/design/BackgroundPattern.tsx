import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  View,
  useColorScheme,
} from 'react-native';

import KentePattern from '../../assets/patterns/kente';
import { paletteForScheme } from './tokens';

// FR-030: motif renders as a low-opacity background overlay behind
// content. FR-032: honor reduce-motion — because this background is
// static (no animation at all), the only reduce-motion concession is
// to avoid introducing any future transitions here. We read the
// preference so callers opting to wrap this in a fade can check it
// through a single import site. (001-wolof-translate-mobile:T100)
const BACKGROUND_OPACITY = 0.06;

export interface BackgroundPatternProps {
  readonly children?: React.ReactNode;
}

export function BackgroundPattern({
  children,
}: BackgroundPatternProps): React.ReactElement {
  const palette = paletteForScheme(useColorScheme());
  const [, setReduceMotion] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (!cancelled) setReduceMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (v: boolean) => {
        setReduceMotion(v);
      },
    );
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return (
    <View style={styles.root}>
      <View
        style={styles.overlay}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <KentePattern
          width="100%"
          height="100%"
          stroke={palette.secondaryIndigo}
          accent={palette.secondaryOchre}
          opacity={BACKGROUND_OPACITY}
        />
      </View>
      {children}
    </View>
  );
}

export default BackgroundPattern;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
