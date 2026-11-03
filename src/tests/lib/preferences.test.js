import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { readPreference, writePreference } from '../../lib/preferences.js';
import { memoryStorage } from '../helpers/memoryStorage.js';

describe('preferences', () => {
  let storage;
  beforeEach(() => {
    storage = memoryStorage();
    globalThis.localStorage = storage;
  });
  afterEach(() => {
    delete globalThis.localStorage;
  });

  it('should read back the value when it was written before', () => {
    writePreference('open', ['a', 'b']);

    const value = readPreference('open', []);

    expect(value).toEqual(['a', 'b']);
  });

  it('should return the fallback when nothing is stored', () => {
    const key = 'missing';

    const value = readPreference(key, 'normal');

    expect(value).toBe('normal');
  });

  it('should return the fallback when the stored value is damaged', () => {
    storage.setItem('broken', 'not json');

    const value = readPreference('broken', 'normal');

    expect(value).toBe('normal');
  });

  it('should return the fallback when storage is blocked', () => {
    globalThis.localStorage = { getItem: () => { throw new Error('blocked'); } };

    const value = readPreference('open', true);

    expect(value).toBe(true);
  });

  it('should not throw when storage is full', () => {
    globalThis.localStorage = memoryStorage({}, { quota: 0 });

    const write = () => writePreference('open', true);

    expect(write).not.toThrow();
  });
});
