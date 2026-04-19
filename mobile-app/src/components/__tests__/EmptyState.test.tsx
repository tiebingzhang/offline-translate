import { render } from '@testing-library/react-native';
import { i18n } from '@lingui/core';
import React from 'react';

import EmptyState from '../EmptyState';
import { messages } from '@/i18n/locales/en/messages';

beforeAll(() => {
  i18n.load('en', messages);
  i18n.activate('en');
});

describe('EmptyState', () => {
  test('renders the default history.empty message', () => {
    const { getByText } = render(<EmptyState />);
    expect(
      getByText(
        'No translations yet. Hold a direction button on the main screen to start.',
      ),
    ).toBeTruthy();
  });

  test('supports a custom messageKey', () => {
    const { getByText } = render(<EmptyState messageKey="history.replay" />);
    expect(getByText('Replay')).toBeTruthy();
  });
});
