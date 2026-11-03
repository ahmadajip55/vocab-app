import { describe, expect, it } from '@jest/globals';
import { RATE_KEY, createSpeechPlayer, speechKey } from '../../lib/speechPlayer.js';

/**
 * A player whose engine answers `result` and records each call. With 'pending',
 * each reading waits until finish(index, result) ends it.
 */
function playerWith({ result = 'done', storedRate } = {}) {
  const calls = { said: [], stopped: 0, written: [] };
  const pending = [];
  const player = createSpeechPlayer({
    say: (text, lang, options) => {
      calls.said.push({ text, lang, rate: options.rate });
      return result === 'pending' ? new Promise((resolve) => pending.push(resolve)) : Promise.resolve(result);
    },
    stop: () => {
      calls.stopped += 1;
    },
    read: (key, fallback) => (key === RATE_KEY && storedRate !== undefined ? storedRate : fallback),
    write: (key, value) => calls.written.push([key, value]),
  });
  return { player, calls, finish: (index, value) => pending[index](value) };
}

describe('createSpeechPlayer', () => {
  it('should mark the text as playing when it starts reading', () => {
    const { player } = playerWith({ result: 'pending' });

    player.play('たべる', 'ja-JP', 'Japanese');

    expect(player.getState().playing).toBe(speechKey('たべる', 'ja-JP'));
  });

  it('should clear the playing text when the voice finishes', async () => {
    const { player } = playerWith();

    await player.play('たべる', 'ja-JP', 'Japanese');

    expect(player.getState().playing).toBeNull();
  });

  it('should stop instead of reading again when the same text is played while playing', async () => {
    const { player, calls, finish } = playerWith({ result: 'pending' });
    const first = player.play('たべる', 'ja-JP', 'Japanese');

    await player.play('たべる', 'ja-JP', 'Japanese');
    finish(0, 'stopped');
    await first;

    expect(calls.said).toHaveLength(1);
    expect(calls.stopped).toBe(1);
    expect(player.getState().playing).toBeNull();
  });

  it('should keep the newer text playing when an older one ends after it', async () => {
    const { player, finish } = playerWith({ result: 'pending' });
    const first = player.play('たべる', 'ja-JP', 'Japanese');
    player.play('のむ', 'ja-JP', 'Japanese');

    finish(0, 'stopped');
    await first;

    expect(player.getState().playing).toBe(speechKey('のむ', 'ja-JP'));
  });

  it('should name the missing voice when the device has no voice for the language', async () => {
    const { player } = playerWith({ result: 'no-voice' });

    await player.play('たべる', 'ja-JP', 'Japanese');

    expect(player.getState().problem).toEqual({
      key: speechKey('たべる', 'ja-JP'),
      message: "This device has no Japanese voice. Add one in the system's speech or language settings.",
    });
  });

  it('should clear an earlier problem when another text is played', async () => {
    const { player } = playerWith({ result: 'no-voice' });
    await player.play('たべる', 'ja-JP', 'Japanese');

    player.play('Makan', 'id-ID', 'Indonesian');

    expect(player.getState().problem).toBeNull();
  });

  it.each([
    [undefined, 1],
    ['slow', 0.7],
    ['fast', 1],
  ])('should read at rate %p when the stored speed is %p', async (storedRate, rate) => {
    const { player, calls } = playerWith({ storedRate });

    await player.play('たべる', 'ja-JP', 'Japanese');

    expect(calls.said[0].rate).toBe(rate);
  });

  it('should switch to slow speech and remember it when the speed is toggled', () => {
    const { player, calls } = playerWith();

    player.toggleSlow();

    expect(player.getState().rate).toBe('slow');
    expect(calls.written).toEqual([[RATE_KEY, 'slow']]);
  });

  it('should switch back to normal speech when slow speech is toggled again', () => {
    const { player } = playerWith({ storedRate: 'slow' });

    player.toggleSlow();

    expect(player.getState().rate).toBe('normal');
  });

  it('should tell subscribers about changes until they unsubscribe', () => {
    const { player } = playerWith();
    let heard = 0;
    const unsubscribe = player.subscribe(() => (heard += 1));

    player.toggleSlow();
    unsubscribe();
    player.toggleSlow();

    expect(heard).toBe(1);
  });
});
