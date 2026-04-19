import { StyleSheet, View, useColorScheme } from 'react-native';

import DevPanelSheet from '@/components/DevPanelSheet';
import { paletteForScheme } from '@/design/tokens';

// Thin route host — the sheet owns all content per the mock-first slice.
// expo-router header/presentation options are configured in app/_layout.tsx's
// <Stack.Screen name="dev-panel" ... /> so they stay intact.
// (001-wolof-translate-mobile:T086)
export default function DevPanelScreen() {
  const palette = paletteForScheme(useColorScheme());

  return (
    <View style={[styles.container, { backgroundColor: palette.base }]}>
      <DevPanelSheet />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
