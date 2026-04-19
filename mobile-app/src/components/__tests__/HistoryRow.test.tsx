import { fireEvent, render } from '@testing-library/react-native';
import { i18n } from '@lingui/core';
import React from 'react';

import HistoryRow, { type HistoryEntry } from '../HistoryRow';
import { messages } from '@/i18n/locales/en/messages';

const testEntry: HistoryEntry = {
  id: 42,
  requestId: 'req-42',
  direction: 'english_to_wolof',
  transcribedText: 'Good morning',
  translatedText: 'Naka nga def',
  audioPath: 'req-42.m4a',
  audioByteSize: 100_000,
  createdAtMs: 1_700_000_000_000,
};

beforeAll(() => {
  i18n.load('en', messages);
  i18n.activate('en');
});

describe('HistoryRow', () => {
  test('renders source text, translated text, and direction badge', () => {
    const { getByText } = render(
      <HistoryRow entry={testEntry} onReplay={jest.fn()} onDelete={jest.fn()} />,
    );
    expect(getByText('Good morning')).toBeTruthy();
    expect(getByText('Naka nga def')).toBeTruthy();
    expect(getByText('English → Wolof')).toBeTruthy();
  });

  test('shows the wolof_to_english direction badge for that direction', () => {
    const { getByText } = render(
      <HistoryRow
        entry={{ ...testEntry, direction: 'wolof_to_english' }}
        onReplay={jest.fn()}
        onDelete={jest.fn()}
      />,
    );
    expect(getByText('Wolof → English')).toBeTruthy();
  });

  test('fires onReplay when the replay button is pressed', () => {
    const onReplay = jest.fn();
    const { getByLabelText } = render(
      <HistoryRow entry={testEntry} onReplay={onReplay} onDelete={jest.fn()} />,
    );
    fireEvent.press(getByLabelText('Replay this translation'));
    expect(onReplay).toHaveBeenCalledWith(testEntry);
  });

  test('fires onDelete when the swipe-reveal delete action is pressed', () => {
    const onDelete = jest.fn();
    const { getByLabelText } = render(
      <HistoryRow entry={testEntry} onReplay={jest.fn()} onDelete={onDelete} />,
    );
    fireEvent.press(getByLabelText('Delete this translation'));
    expect(onDelete).toHaveBeenCalledWith(testEntry);
  });

  test('composes an accessibility label including direction, timestamp, source, and target (T108)', () => {
    const { getByLabelText } = render(
      <HistoryRow entry={testEntry} onReplay={jest.fn()} onDelete={jest.fn()} />,
    );
    // Timestamp formatting is locale-dependent; assert on the structural
    // bookends and the source / target substrings instead of a full string
    // match. (001-wolof-translate-mobile:T108)
    expect(
      getByLabelText(
        /^English → Wolof on .+\. Source: Good morning\. Translation: Naka nga def\.$/,
      ),
    ).toBeTruthy();
  });
});
