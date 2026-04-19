// StatusPill — FR-013 / FR-025 render coverage.
// (001-wolof-translate-mobile:T117)
import '@/i18n';
import React from 'react';
import { render } from '@testing-library/react-native';

import StatusPill, { type BackendStage } from '@/components/StatusPill';

describe('StatusPill', () => {
  test('renders nothing when stage and uploadProgress are both null', () => {
    const tree = render(<StatusPill stage={null} uploadProgress={null} />);
    expect(tree.toJSON()).toBeNull();
  });

  test('renders the stage label when stage is set', () => {
    const tree = render(<StatusPill stage="transcribing" />);
    // i18n key "stage.transcribing" resolves to "Transcribing".
    expect(tree.getByText(/Transcribing/)).toBeTruthy();
  });

  test('renders queued fallback label when only uploadProgress is set', () => {
    const tree = render(<StatusPill stage={null} uploadProgress={0.5} />);
    // uploadProgress 0.5 -> 50%, label defaults to stage.queued ("Queued").
    expect(tree.getByText(/Queued.*50%/)).toBeTruthy();
  });

  test('appends upload progress percentage when in range', () => {
    const tree = render(<StatusPill stage="queued" uploadProgress={0.25} />);
    expect(tree.getByText(/25%/)).toBeTruthy();
  });

  test('omits progress when uploadProgress is out of range', () => {
    const tree = render(<StatusPill stage="queued" uploadProgress={1.5} />);
    const text = tree.getByText(/Queued/).props.children.join('');
    expect(text).not.toMatch(/%/);
  });

  test.each<BackendStage>([
    'queued',
    'normalizing',
    'transcribing',
    'translating',
    'generating_speech',
    'completed',
    'failed',
  ])('renders stage=%s without crashing and sets a11yLabel', (stage) => {
    const tree = render(<StatusPill stage={stage} />);
    // Container has an accessibilityLabel derived from i18n.
    const root = tree.root.findByProps({ accessibilityRole: 'text' });
    expect(root.props.accessibilityLabel).toMatch(/Translation status:/);
  });
});
