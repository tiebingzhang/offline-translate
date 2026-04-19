import { StyleSheet, View, useColorScheme } from 'react-native';

import SettingsSheet from '@/components/SettingsSheet';
import BackgroundPattern from '@/design/BackgroundPattern';
import { paletteForScheme } from '@/design/tokens';

// Thin route host — the sheet owns all content per the mock-first slice.
// expo-router header/presentation options are configured in
// app/_layout.tsx's <Stack.Screen name="settings" ... /> and stay intact.
// (001-wolof-translate-mobile:T104)
export default function SettingsScreen() {
  const palette = paletteForScheme(useColorScheme());

  return (
    <View style={[styles.container, { backgroundColor: palette.base }]}>
      <BackgroundPattern>
        <SettingsSheet />
      </BackgroundPattern>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
