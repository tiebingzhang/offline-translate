import { fromWire, toWire } from '../casing';

describe('casing converters', () => {
  describe('fromWire (snake_case → camelCase)', () => {
    it('converts flat keys', () => {
      expect(fromWire({ request_id: 'abc', poll_after_ms: 500 })).toEqual({
        requestId: 'abc',
        pollAfterMs: 500,
      });
    });

    it('converts nested objects', () => {
      const wire = {
        request_id: 'abc',
        result: {
          transcribed_text: 'hi',
          audio_url: '/api/requests/abc/audio',
        },
      };
      expect(fromWire(wire)).toEqual({
        requestId: 'abc',
        result: {
          transcribedText: 'hi',
          audioUrl: '/api/requests/abc/audio',
        },
      });
    });

    it('converts arrays of objects', () => {
      expect(fromWire({ items: [{ a_b: 1 }, { a_b: 2 }] })).toEqual({
        items: [{ aB: 1 }, { aB: 2 }],
      });
    });

    it('passes primitives through', () => {
      expect(fromWire(null as never)).toBeNull();
      expect(fromWire(42 as never)).toBe(42);
      expect(fromWire('plain' as never)).toBe('plain');
    });

    it('preserves null values within objects', () => {
      expect(fromWire({ error_info: null })).toEqual({ errorInfo: null });
    });
  });

  describe('toWire (camelCase → snake_case)', () => {
    it('converts flat keys', () => {
      expect(toWire({ requestId: 'abc', pollAfterMs: 500 })).toEqual({
        request_id: 'abc',
        poll_after_ms: 500,
      });
    });

    it('converts nested objects and arrays', () => {
      const domain = {
        requestIds: ['a', 'b'],
        payload: { targetLanguage: 'wolof', itemsMeta: [{ itemId: 1 }] },
      };
      expect(toWire(domain)).toEqual({
        request_ids: ['a', 'b'],
        payload: { target_language: 'wolof', items_meta: [{ item_id: 1 }] },
      });
    });
  });
});
