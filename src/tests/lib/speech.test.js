import { afterEach, describe, expect, it } from '@jest/globals';
import { SPEECH_RATES, canSpeak, loadVoices, pickVoice, speak, stopSpeaking } from '../../lib/speech.js';
import { readAloudText } from '../../languages/japanese/romaji.js';
import { installFakeSpeech } from '../helpers/fakeSpeech.js';

const voice = (name, lang, extra = {}) => ({ name, lang, localService: false, default: false, ...extra });

const VOICES = [
  voice('Samantha', 'en-US', { default: true, localService: true }),
  voice('Daniel', 'en-GB', { localService: true }),
  voice('Kyoko', 'ja-JP', { localService: true }),
  voice('Google 日本語', 'ja-JP'),
  voice('Damayanti', 'id-ID', { localService: true }),
];

describe('pickVoice', () => {
  it('should pick a Japanese voice when the language is Japanese', () => {
    const picked = pickVoice('ja-JP', VOICES);

    expect(picked.lang).toBe('ja-JP');
  });

  it('should prefer the better-sounding voice when several match', () => {
    const picked = pickVoice('ja-JP', VOICES);

    expect(picked.name).toBe('Google 日本語');
  });

  it('should prefer the same region when the language has several', () => {
    const picked = pickVoice('en-GB', VOICES);

    expect(picked.name).toBe('Daniel');
  });

  it('should fall back to another region of the language when the region has no voice', () => {
    const picked = pickVoice('en-AU', VOICES);

    expect(picked.lang.startsWith('en')).toBe(true);
  });

  it.each([
    ['a language with no voice', 'de-DE', VOICES],
    ['no voices at all', 'ja-JP', []],
  ])('should return null when there is %s', (_, lang, voices) => {
    const picked = pickVoice(lang, voices);

    expect(picked).toBeNull();
  });

  it('should accept an underscore in the voice language when the browser writes it that way', () => {
    const voices = [voice('Kyoko', 'ja_JP')];

    const picked = pickVoice('ja-JP', voices);

    expect(picked.name).toBe('Kyoko');
  });
});

describe('speak', () => {
  let fake;
  afterEach(() => fake?.remove());

  it('should report "unsupported" when the browser has no speech synthesis', async () => {
    const text = '食べる';

    const result = await speak(text, 'ja-JP');

    expect(result).toBe('unsupported');
  });

  it('should read with the chosen voice and rate when the device has a voice for the language', async () => {
    fake = installFakeSpeech({ voices: VOICES });

    const result = await speak('たべる', 'ja-JP', { rate: SPEECH_RATES.slow });

    expect(result).toBe('done');
    expect(fake.spoken.map((u) => [u.text, u.voice.name, u.lang, u.rate])).toEqual([['たべる', 'Google 日本語', 'ja-JP', 0.7]]);
  });

  it('should report "no-voice" and read nothing when the device has no voice for the language', async () => {
    fake = installFakeSpeech({ voices: VOICES });

    const result = await speak('Hallo', 'de-DE');

    expect(result).toBe('no-voice');
    expect(fake.spoken).toEqual([]);
  });

  it.each([
    ['interrupted', 'stopped'],
    ['canceled', 'stopped'],
    ['synthesis-failed', 'done'],
  ])('should report %p as %p when the engine stops with that error', async (error, expected) => {
    fake = installFakeSpeech({ voices: VOICES, error });

    const result = await speak('たべる', 'ja-JP');

    expect(result).toBe(expected);
  });

  it('should call onStart when the voice starts speaking', async () => {
    fake = installFakeSpeech({ voices: VOICES });
    let started = false;

    await speak('たべる', 'ja-JP', { onStart: () => (started = true) });

    expect(started).toBe(true);
  });

  it.each(['', '   ', null])('should report "unsupported" when the text is %p', async (text) => {
    fake = installFakeSpeech({ voices: VOICES });

    const result = await speak(text, 'ja-JP');

    expect(result).toBe('unsupported');
  });
});

describe('canSpeak', () => {
  let fake;
  afterEach(() => fake?.remove());

  it('should be false when the browser has no speech synthesis', () => {
    const supported = canSpeak();

    expect(supported).toBe(false);
  });

  it('should be true when the browser has speech synthesis', () => {
    fake = installFakeSpeech();

    const supported = canSpeak();

    expect(supported).toBe(true);
  });
});

describe('loadVoices', () => {
  let fake;
  afterEach(() => fake?.remove());

  it('should return the voices at once when the browser already has them', async () => {
    fake = installFakeSpeech({ voices: VOICES });

    const voices = await loadVoices();

    expect(voices).toHaveLength(VOICES.length);
  });

  it('should return an empty list after the timeout when the browser never loads voices', async () => {
    fake = installFakeSpeech({ voices: [] });

    const voices = await loadVoices(5);

    expect(voices).toEqual([]);
  });

  it('should return an empty list when the browser has no speech synthesis', async () => {
    const timeoutMs = 5;

    const voices = await loadVoices(timeoutMs);

    expect(voices).toEqual([]);
  });
});

describe('stopSpeaking', () => {
  it('should cancel the engine when something may be speaking', () => {
    const fake = installFakeSpeech();

    stopSpeaking();
    fake.remove();

    expect(fake.engine.cancelled).toBe(1);
  });
});

describe('readAloudText', () => {
  it.each([
    ['a kanji word with its kana reading', { term: '食べる', kana: 'たべる', romaji: 'taberu', wordLanguage: 'ja' }, 'たべる'],
    ['a kanji word with only romaji', { term: '食べる', romaji: 'taberu', wordLanguage: 'ja' }, 'たべる'],
    ['a katakana word', { term: 'コーヒー', wordLanguage: 'ja' }, 'コーヒー'],
    ['a kanji word with no reading yet', { term: '毎朝', wordLanguage: 'ja' }, '毎朝'],
    ['an English word', { term: 'Thrive', wordLanguage: 'en' }, 'Thrive'],
  ])('should read %s as %p when it is read aloud', (_, word, expected) => {
    const text = readAloudText(word);

    expect(text).toBe(expected);
  });
});
