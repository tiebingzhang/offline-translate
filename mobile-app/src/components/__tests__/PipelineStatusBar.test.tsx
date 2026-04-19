import '@/i18n';
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import PipelineStatusBar, {
  PipelineStatusBarView,
} from '@/components/PipelineStatusBar';
import { usePipelineStore } from '@/state/pipeline-store';
import { initialPipelineState } from '@/pipeline/state-machine';

jest.mock('@/audio/player', () => ({
  defaultPlayer: {
    playResult: jest.fn(async () => {}),
    stop: jest.fn(),
  },
}));

function setPipeline(partial: Partial<ReturnType<typeof usePipelineStore.getState>>) {
  usePipelineStore.setState({
    ...usePipelineStore.getState(),
    ...initialPipelineState,
    ...partial,
  });
}

describe('PipelineStatusBarView — snapshots', () => {
  it('renders null when visible=false', () => {
    const tree = render(
      <PipelineStatusBarView
        stepLabelKey="step.idle"
        secondsLeft={0}
        visible={false}
      />,
    ).toJSON();
    expect(tree).toBeNull();
  });

  it('renders uploading label', () => {
    const tree = render(
      <PipelineStatusBarView
        stepLabelKey="step.uploading"
        secondsLeft={33}
        visible={true}
      />,
    );
    expect(tree.getByTestId('PipelineStatusBar')).toBeTruthy();
    expect(tree.queryByText('Uploading recording')).toBeTruthy();
    expect(tree.queryByText('33s remaining')).toBeTruthy();
  });

  it('renders transcribing.english during polling', () => {
    const tree = render(
      <PipelineStatusBarView
        stepLabelKey="step.transcribing.english"
        secondsLeft={27}
        visible={true}
      />,
    );
    expect(tree.queryByText('Transcribing English audio to text')).toBeTruthy();
    expect(tree.queryByText('27s remaining')).toBeTruthy();
  });

  it('renders playing label on completion', () => {
    const tree = render(
      <PipelineStatusBarView
        stepLabelKey="step.playing"
        secondsLeft={5}
        visible={true}
      />,
    );
    expect(tree.queryByText('Playing translation')).toBeTruthy();
  });

  it('renders timed_out with zero countdown', () => {
    const tree = render(
      <PipelineStatusBarView
        stepLabelKey="step.timed_out"
        secondsLeft={0}
        visible={true}
      />,
    );
    expect(tree.queryByText('Timed out')).toBeTruthy();
    expect(tree.queryByText('0s remaining')).toBeTruthy();
  });

  it('sets accessibilityLabel with step + seconds remaining', () => {
    const tree = render(
      <PipelineStatusBarView
        stepLabelKey="step.uploading"
        secondsLeft={33}
        visible={true}
      />,
    );
    const bar = tree.getByTestId('PipelineStatusBar');
    expect(bar.props.accessibilityLabel).toContain('Uploading recording');
    expect(bar.props.accessibilityLabel).toContain('33');
    expect(bar.props.accessibilityLabel.toLowerCase()).toContain('seconds remaining');
  });
});

describe('PipelineStatusBar — live countdown tick', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    usePipelineStore.setState({
      ...usePipelineStore.getState(),
      ...initialPipelineState,
    });
  });

  it('decrements 5 → 4 → 3 → 2 → 1 → 0 at 1 Hz and clamps at 0', () => {
    const now = 1_000_000_000_000;
    jest.setSystemTime(now);
    setPipeline({
      phase: 'polling',
      backendStage: 'transcribing',
      direction: 'english_to_wolof',
      timeoutAtMs: now + 5_000,
    });

    const tree = render(<PipelineStatusBar />);
    expect(tree.queryByText('5s remaining')).toBeTruthy();

    for (const expected of [4, 3, 2, 1, 0]) {
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(tree.queryByText(`${expected}s remaining`)).toBeTruthy();
    }

    // never goes below 0
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(tree.queryByText('0s remaining')).toBeTruthy();
    expect(tree.queryByText('-1s remaining')).toBeNull();
  });

  it('freezes countdown on terminal phase (completed)', () => {
    const now = 1_000_000_000_000;
    jest.setSystemTime(now);
    setPipeline({
      phase: 'polling',
      backendStage: 'translating',
      direction: 'english_to_wolof',
      timeoutAtMs: now + 10_000,
    });

    const tree = render(<PipelineStatusBar />);
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(tree.queryByText('8s remaining')).toBeTruthy();

    act(() => {
      setPipeline({
        phase: 'completed',
        backendStage: 'completed',
        direction: 'english_to_wolof',
        timeoutAtMs: now + 10_000,
      });
    });

    // countdown should stop updating — advance system time past original timeout
    act(() => {
      jest.advanceTimersByTime(15_000);
    });

    // on completed phase, label shows step.playing; countdown must not go negative
    expect(tree.queryByText('-5s remaining')).toBeNull();
  });

  it('renders null when phase is idle', () => {
    setPipeline({ phase: 'idle', timeoutAtMs: null });
    const tree = render(<PipelineStatusBar />);
    expect(tree.toJSON()).toBeNull();
  });
});
