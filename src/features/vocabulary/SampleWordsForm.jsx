import { useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { SelectField, TextField } from '../../components/Fields.jsx';
import { useVocabulary } from '../../hooks/useVocabulary.js';
import { getLanguage } from '../../languages/index.js';
import { isKanaOnly, toKanaReading } from '../../languages/japanese/romaji.js';
import { translateTerms } from './aiMeaning.js';
import { defaultMeaningLanguage, meaningLanguageOptions } from './model.js';
import { SAMPLE_MAX, fetchSampleTerms } from './sampleSource.js';

/**
 * Downloads up to 100 sample words for the program's language and levels,
 * translates them into the chosen meaning language and saves both.
 */
export function SampleWordsForm({ onAdded }) {
  const { program, words, addWords } = useVocabulary();
  const [count, setCount] = useState('10');
  const [meaningLanguage, setMeaningLanguage] = useState(() => defaultMeaningLanguage(words, program.wordLanguage));
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const source = program.wordLanguage === 'ja' ? 'the JLPT word list' : `a ${getLanguage(program.wordLanguage).label} frequency list`;
  const meaningOptions = meaningLanguageOptions(program.wordLanguage);

  async function handleSubmit(event) {
    event.preventDefault();
    const wanted = Number(count);
    if (!Number.isInteger(wanted) || wanted < 1 || wanted > SAMPLE_MAX) {
      setError(`Enter a whole number from 1 to ${SAMPLE_MAX}.`);
      return;
    }
    setError('');
    setStatus('Downloading sample words…');
    setLoading(true);
    try {
      const found = await fetchSampleTerms({
        wordLanguage: program.wordLanguage,
        levels: program.levels,
        count: wanted,
        // The same word with another meaning language is a separate entry, so only skip this language.
        existingTerms: words.filter((word) => word.meaningLanguage === meaningLanguage).map((word) => word.term),
      });
      if (found.terms.length === 0) {
        setStatus(
          `No new words left for ${found.levels.join(', ')}. Every word from this level already has a ${getLanguage(meaningLanguage).label} meaning.`,
        );
        return;
      }

      const target = getLanguage(meaningLanguage).label;
      setStatus(`Translating ${found.terms.length} words into ${target}…`);
      const translated = await translateTerms(found.terms, {
        sourceLanguage: program.wordLanguage,
        targetLanguage: meaningLanguage,
        onProgress: (done, total) => setStatus(`Translating into ${target}: ${done} of ${total}…`),
      });

      addWords(
        found.terms.map((term, index) => ({
          term,
          romaji: found.romaji[index],
          // The reading in kana, for words written with kanji (勉強 -> べんきょう).
          kana: program.wordLanguage === 'ja' && !isKanaOnly(term) ? toKanaReading(found.romaji[index]) : '',
          meaning: translated.meanings[index],
          meaningLanguage,
        })),
      );

      const missing = translated.meanings.filter((meaning) => !meaning).length;
      const parts = [`${found.terms.length} words added from ${found.levels.join(', ')} with ${target} meanings.`];
      if (found.terms.length < wanted) parts.push(`Only ${found.terms.length} new words were left for this level.`);
      if (missing) {
        parts.push(
          `${missing} could not be translated${translated.error ? ` (${translated.error})` : ''}; use "Search meaning" when editing them.`,
        );
      }
      setStatus(parts.join(' '));
      onAdded?.(found.terms.length);
    } catch (fetchError) {
      setStatus('');
      setError(fetchError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card card-body vstack gap-3" onSubmit={handleSubmit} noValidate aria-labelledby="sample-title">
      <h2 id="sample-title" className="h5 mb-0">Load sample words</h2>
      <div className="row g-3 align-items-start">
        <TextField
          className="col-sm-4"
          label="Number of words"
          type="number"
          inputMode="numeric"
          min={1}
          max={SAMPLE_MAX}
          step={1}
          value={count}
          onChange={(event) => {
            setCount(event.target.value);
            setError('');
          }}
          error={error}
          hint={`1 to ${SAMPLE_MAX}. Picked at random from ${source}, matching this program's level${program.levels.length > 1 ? 's' : ''}.`}
        />
        <SelectField
          className="col-sm-4"
          label="Meaning language"
          value={meaningLanguage}
          onChange={(event) => setMeaningLanguage(event.target.value)}
          hint="The words are translated into this language and saved with it."
          disabled={loading}
        >
          {meaningOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <div className="col-sm-4 pt-sm-4 mt-sm-1">
          <Button type="submit" disabled={loading}>
            {loading ? 'Loading…' : 'Load sample words'}
          </Button>
        </div>
      </div>
      {status ? (
        <p className="small text-body-secondary mb-0" role="status">
          {status}
        </p>
      ) : null}
    </form>
  );
}
