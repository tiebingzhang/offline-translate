import { i18n } from '@lingui/core';
import { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';

import DirectionButton, { type Direction } from '@/components/DirectionButton';
import MetadataGrid from '@/components/MetadataGrid';
import StatusPill, { type BackendStage } from '@/components/StatusPill';
import { paletteForScheme, radii, spacing, typography } from '@/design/tokens';

type MockPressKey = Direction | null;

const STAGE_CYCLE: BackendStage[] = [
  'queued',
  'normalizing',
  'transcribing',
  'translating',
  'generating_speech',
  'completed',
];

const MOCK_TRANSCRIBED = 'Good morning, how are you today?';
const MOCK_TRANSLATED = 'Naka nga def ci suba si, jamm nga am?';

export default function MainScreen() {
  const palette = paletteForScheme(useColorScheme());

  const [pressed, setPressed] = useState<MockPressKey>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (pressed == null) {
      setElapsedSec(0);
      return;
    }
    const started = Date.now();
    const tick = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 250);
    return () => clearInterval(tick);
  }, [pressed]);

  useEffect(() => {
    const id = setInterval(() => {
      setStageIndex((prev) => (prev + 1) % STAGE_CYCLE.length);
    }, 1500);
    return () => clearInterval(id);
  }, []);

  const activeDirection: Direction = pressed ?? 'english_to_wolof';
  const currentStage = STAGE_CYCLE[stageIndex];

  const countdown = useMemo(() => {
    if (pressed == null) return null;
    const remaining = 60 - elapsedSec;
    return remaining <= 5 ? Math.max(remaining, 0) : null;
  }, [pressed, elapsedSec]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.base }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: palette.text }]}>
            {i18n._('app.name')}
          </Text>
          <StatusPill stage={currentStage} />
        </View>

        <View style={styles.buttons}>
          <DirectionButton
            direction="english_to_wolof"
            pressed={pressed === 'english_to_wolof'}
            recording={pressed === 'english_to_wolof'}
            elapsedSec={elapsedSec}
            countdownSec={pressed === 'english_to_wolof' ? countdown : null}
            onPressIn={() => setPressed('english_to_wolof')}
            onPressOut={() => setPressed(null)}
          />
          <DirectionButton
            direction="wolof_to_english"
            pressed={pressed === 'wolof_to_english'}
            recording={pressed === 'wolof_to_english'}
            elapsedSec={elapsedSec}
            countdownSec={pressed === 'wolof_to_english' ? countdown : null}
            onPressIn={() => setPressed('wolof_to_english')}
            onPressOut={() => setPressed(null)}
          />
        </View>

        <MetadataGrid
          durationSec={elapsedSec > 0 ? elapsedSec : 3.2}
          sampleRateHz={16000}
          channels={1}
          direction={activeDirection}
        />

        <View
          style={[
            styles.textBlock,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <Text style={[styles.textLabel, { color: palette.textMuted }]}>
            {i18n._('text.source')}
          </Text>
          <Text style={[styles.textBody, { color: palette.text }]}>
            {MOCK_TRANSCRIBED}
          </Text>
        </View>

        <View
          style={[
            styles.textBlock,
            { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
          ]}
        >
          <Text style={[styles.textLabel, { color: palette.textMuted }]}>
            {i18n._('text.translation')}
          </Text>
          <Text style={[styles.textBody, { color: palette.text }]}>
            {MOCK_TRANSLATED}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    padding: spacing.xl,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: {
    fontFamily: typography.heading.fontFamily,
    fontWeight: typography.heading.fontWeight,
    fontSize: typography.heading.sizes.lg,
  },
  buttons: {
    gap: spacing.md,
  },
  textBlock: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  textLabel: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textBody: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.sizes.lg,
    lineHeight: 26,
  },
});
