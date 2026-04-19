type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());
}

function camelToSnake(key: string): string {
  return key.replace(/([A-Z])/g, (_, ch: string) => `_${ch.toLowerCase()}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function convertKeys(value: unknown, transform: (k: string) => string): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => convertKeys(v, transform));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      out[transform(key)] = convertKeys(value[key], transform);
    }
    return out;
  }
  return value;
}

export function fromWire<T = unknown>(wire: unknown): T {
  return convertKeys(wire, snakeToCamel) as T;
}

export function toWire<T = unknown>(domain: unknown): T {
  return convertKeys(domain, camelToSnake) as T;
}

export type { Json };
