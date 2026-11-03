import { useSpeech } from '../hooks/useSpeech.js';
import { getLanguage } from '../languages/index.js';
import { readAloudText } from '../languages/japanese/romaji.js';
import { canSpeak } from '../lib/speech.js';
import { Button } from './Button.jsx';

/**
 * Reads `text` aloud in `language` (a word-language code), or a saved `word` in
 * its own language (Japanese from its kana). While it plays, the button shows
 * "Playing…" and pressing it again stops. If the device has no voice for the
 * language, a short message says so. Renders nothing without speech support.
 * `iconOnly` makes a small speaker button (word list); `label` is the visible text otherwise.
 */
export function ListenButton({ word, text = readAloudText(word), language = word?.wordLanguage, label = 'Listen', ariaLabel, iconOnly = false, size }) {
  const { play, isPlaying: playingNow, problemOf } = useSpeech();
  if (!canSpeak() || !text) return null;

  const languageLabel = getLanguage(language).label;
  const isPlaying = playingNow(text, language);
  const message = problemOf(text, language);

  return (
    <>
      <Button
        size={iconOnly ? 'small' : size}
        variant={iconOnly ? 'ghost' : 'default'}
        className={iconOnly ? 'listen-icon' : 'd-inline-flex align-items-center gap-2'}
        onClick={() => play(text, language)}
        aria-label={isPlaying ? `Stop reading ${text}` : (ariaLabel ?? `Listen to ${text}`)}
        aria-pressed={isPlaying}
        title={iconOnly ? (isPlaying ? 'Stop' : `Listen (${languageLabel})`) : undefined}
      >
        <SpeakerIcon playing={isPlaying} />
        {iconOnly ? null : <span>{isPlaying ? 'Playing…' : label}</span>}
      </Button>
      {message ? (
        <span className="small text-danger" role="status">
          {message}
        </span>
      ) : null}
    </>
  );
}

/** "Slow" switch for every Listen button; the choice is remembered on this device. */
export function SpeechSpeedToggle() {
  const { rate, toggleSlow } = useSpeech();
  if (!canSpeak()) return null;
  const slow = rate === 'slow';
  return (
    <Button size="small" variant={slow ? 'primary' : 'default'} onClick={toggleSlow} aria-pressed={slow} title="Read aloud more slowly">
      {slow ? 'Slow speech: on' : 'Slow speech: off'}
    </Button>
  );
}

function SpeakerIcon({ playing }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4V5Z" fill="currentColor" />
      {playing ? (
        <path d="M16 9.5a4 4 0 0 1 0 5M19 7a8 8 0 0 1 0 10" />
      ) : (
        <path d="M16 9.5a4 4 0 0 1 0 5" />
      )}
    </svg>
  );
}
