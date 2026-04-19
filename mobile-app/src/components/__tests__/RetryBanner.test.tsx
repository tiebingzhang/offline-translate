import '@/i18n';
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import RetryBanner from '@/components/RetryBanner';
import { TranslationError } from '@/api/bff-client';

function makeError(kind: Parameters<typeof makeErrorRaw>[0], retryable: boolean): TranslationError {
  return makeErrorRaw(kind, retryable);
}

function makeErrorRaw(
  kind:
    | 'upload_failed'
    | 'poll_failed'
    | 'server_failed'
    | 'client_timeout'
    | 'malformed_response',
  retryable: boolean,
): TranslationError {
  return new TranslationError({ kind, message: `${kind} message`, retryable });
}

describe('RetryBanner — kind variants (T076 mock evidence)', () => {
  test('upload_failed (retryable): shows kind title + Retry primary + Discard secondary', () => {
    const onRetry = jest.fn();
    const onDiscard = jest.fn();
    const tree = render(
      <RetryBanner
        error={makeError('upload_failed', true)}
        phase="failed"
        onRetry={onRetry}
        onDiscard={onDiscard}
      />,
    );

    expect(tree.getByTestId('RetryBanner.upload_failed')).toBeTruthy();
    expect(tree.queryByText('Network problem')).toBeTruthy();
    expect(tree.queryByText('Could not reach the server. Your recording is saved.')).toBeTruthy();

    const retry = tree.getByTestId('RetryBanner.retry');
    fireEvent.press(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);

    const discard = tree.getByTestId('RetryBanner.discard');
    fireEvent.press(discard);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  test('poll_failed (retryable): shows Connection lost + Retry button', () => {
    const tree = render(
      <RetryBanner
        error={makeError('poll_failed', true)}
        phase="failed"
        onRetry={jest.fn()}
        onDiscard={jest.fn()}
      />,
    );
    expect(tree.queryByText('Connection lost')).toBeTruthy();
    expect(tree.queryByTestId('RetryBanner.retry')).toBeTruthy();
  });

  test('server_failed non-retryable: hides Retry, promotes Discard to primary', () => {
    const tree = render(
      <RetryBanner
        error={makeError('server_failed', false)}
        phase="failed"
        onRetry={jest.fn()}
        onDiscard={jest.fn()}
      />,
    );
    expect(tree.queryByText('Server problem')).toBeTruthy();
    expect(tree.queryByTestId('RetryBanner.retry')).toBeNull();
    expect(tree.queryByTestId('RetryBanner.discard')).toBeTruthy();
  });

  test('client_timeout: shows Taking too long + Retry button', () => {
    const tree = render(
      <RetryBanner
        error={makeError('client_timeout', true)}
        phase="failed"
        onRetry={jest.fn()}
        onDiscard={jest.fn()}
      />,
    );
    expect(tree.queryByText('Taking too long')).toBeTruthy();
    expect(tree.queryByTestId('RetryBanner.retry')).toBeTruthy();
  });

  test('malformed_response (non-retryable): hides Retry, promotes Discard', () => {
    const tree = render(
      <RetryBanner
        error={makeError('malformed_response', false)}
        phase="failed"
        onRetry={jest.fn()}
        onDiscard={jest.fn()}
      />,
    );
    expect(tree.queryByText('Unexpected response')).toBeTruthy();
    expect(tree.queryByTestId('RetryBanner.retry')).toBeNull();
    expect(tree.queryByTestId('RetryBanner.discard')).toBeTruthy();
  });

  test('phase=timed_out without error: shows timeout title + Retry (FR-020 always retryable)', () => {
    const tree = render(
      <RetryBanner
        error={null}
        phase="timed_out"
        onRetry={jest.fn()}
        onDiscard={jest.fn()}
      />,
    );
    expect(tree.getByTestId('RetryBanner.timed_out')).toBeTruthy();
    expect(tree.queryByText('Taking too long')).toBeTruthy();
    expect(tree.queryByTestId('RetryBanner.retry')).toBeTruthy();
  });

  test('phase=failed with no error: shows unknown variant + no Retry', () => {
    const tree = render(
      <RetryBanner
        error={null}
        phase="failed"
        onRetry={jest.fn()}
        onDiscard={jest.fn()}
      />,
    );
    expect(tree.getByTestId('RetryBanner.unknown')).toBeTruthy();
    expect(tree.queryByText('Something went wrong')).toBeTruthy();
    expect(tree.queryByTestId('RetryBanner.retry')).toBeNull();
  });
});
