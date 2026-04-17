import { i18n } from '@lingui/core';
import { StyleSheet, Text, View } from 'react-native';

import { lightPalette, spacing, typography } from '@/design/tokens';

export default function DevPanelScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{i18n._('screen.devPanel')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: lightPalette.base,
  },
  heading: {
    fontFamily: typography.heading.fontFamily,
    fontWeight: typography.heading.fontWeight,
    fontSize: typography.heading.sizes.lg,
    color: lightPalette.text,
  },
});
