import { i18n } from '@lingui/core';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useColorScheme,
} from 'react-native';

import { paletteForScheme, radii, spacing, typography } from '@/design/tokens';
import { useSettingsStore } from '@/state/settings-store';

// FR-028a — the Settings sheet is the user-facing sibling of the Dev
// Panel: always visible, distinct surface, room to grow. V1 hosts a
// single tap-mode row (FR-028) bound to settings-store.tapMode. The
// section wrapper is shaped the same way DevPanelSheet shapes its
// rows so future additions (locale, haptics, etc.) slot in without
// restructure. (001-wolof-translate-mobile:T103)

export interface SettingsSheetProps {
  readonly _mockOnly?: never;
}

export function SettingsSheet(_props: SettingsSheetProps = {}) {
  const palette = paletteForScheme(useColorScheme());

  const tapMode = useSettingsStore((s) => s.tapMode);
  const setTapMode = useSettingsStore((s) => s.setTapMode);

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: palette.base }]}
      contentContainerStyle={styles.screenContent}
      testID="SettingsSheet"
      accessibilityLabel={i18n._('a11y.settingsSheet.label')}
    >
      <Text style={[styles.title, { color: palette.text }]}>
        {i18n._('settings.title')}
      </Text>

      <View
        style={[
          styles.section,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <View style={styles.toggleRow}>
          <View style={styles.toggleLabelColumn}>
            <Text style={[styles.toggleTitle, { color: palette.text }]}>
              {i18n._('settings.tapMode.label')}
            </Text>
            <Text style={[styles.toggleHint, { color: palette.textMuted }]}>
              {i18n._('settings.tapMode.description')}
            </Text>
          </View>
          <Switch
            accessibilityLabel={i18n._('settings.tapMode.label')}
            accessibilityHint={i18n._('settings.tapMode.description')}
            testID="SettingsSheet.tapModeToggle"
            value={tapMode}
            onValueChange={(next) => {
              setTapMode(next);
            }}
          />
        </View>
      </View>
    </ScrollView>
  );
}

export default SettingsSheet;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  screenContent: {
    padding: spacing.xl,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  title: {
    fontFamily: typography.heading.fontFamily,
    fontWeight: typography.heading.fontWeight,
    fontSize: typography.heading.sizes.lg,
  },
  section: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  toggleLabelColumn: {
    flexShrink: 1,
    gap: spacing.xs,
  },
  toggleTitle: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.md,
    fontWeight: '600',
  },
  toggleHint: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.sm,
    lineHeight: 20,
  },
});
