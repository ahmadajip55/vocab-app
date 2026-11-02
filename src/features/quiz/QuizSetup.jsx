import { useMemo, useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { SelectField } from '../../components/Fields.jsx';
import { getLanguage } from '../../languages/index.js';
import { meaningLanguagesOf } from '../vocabulary/model.js';

const COUNT_OPTIONS = [5, 10, 20, 30, 50, 75, 100, 'all'];

export function QuizSetup({ words, onStart }) {
  const languages = useMemo(() => meaningLanguagesOf(words), [words]);
  const [starting, setStarting] = useState(false); // missing meanings are being looked up
  const [settings, setSettings] = useState(() => ({
    meaningLanguage: languages[0]?.code ?? '',
    direction: 'term-to-meaning',
    type: 'choice',
    count: 10,
  }));
  // Only entries with the chosen meaning language take part.
  const available = useMemo(
    () => words.filter((word) => word.meaningLanguage === settings.meaningLanguage).length,
    [words, settings.meaningLanguage],
  );
  const questionCount = settings.count === 'all' ? available : Math.min(settings.count, available);

  const update = (field, value) => setSettings((current) => ({ ...current, [field]: value }));

  return (
    <form
      className="card card-body vstack gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (available === 0 || starting) return;
        setStarting(true);
        Promise.resolve(onStart(settings)).finally(() => setStarting(false));
      }}
    >
      <h2 className="h5 mb-0">Set up quiz</h2>
      <div className="row g-3">
        <SelectField
          className="col-md-6"
          label="Meaning language"
          value={settings.meaningLanguage}
          onChange={(e) => update('meaningLanguage', e.target.value)}
          hint="Questions and answer options use the meanings in this language."
        >
          {languages.map(({ code, count }) => (
            <option key={code} value={code}>
              {getLanguage(code).label} ({count} {count === 1 ? 'word' : 'words'})
            </option>
          ))}
        </SelectField>
        <SelectField
          className="col-md-6"
          label="Number of questions"
          value={String(settings.count)}
          onChange={(e) => update('count', e.target.value === 'all' ? 'all' : Number(e.target.value))}
        >
          {COUNT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === 'all' ? 'All words' : `${option} questions`}
            </option>
          ))}
        </SelectField>
        <SelectField className="col-md-6" label="Question direction" value={settings.direction} onChange={(e) => update('direction', e.target.value)}>
          <option value="term-to-meaning">Word to meaning</option>
          <option value="meaning-to-term">Meaning to word</option>
          <option value="mixed">Mixed</option>
        </SelectField>
        <SelectField
          className="col-md-6"
          label="Answer type"
          value={settings.type}
          onChange={(e) => update('type', e.target.value)}
          hint={
            settings.type === 'typing'
              ? 'A single typo in a longer word still counts as correct.'
              : 'Multiple choice works best with at least 4 different words.'
          }
        >
          <option value="choice">Multiple choice</option>
          <option value="typing">Type answer</option>
          <option value="mixed">Mixed</option>
        </SelectField>
      </div>
      <p className="small text-body-secondary mb-0">If the quiz has fewer items than the word list, not-yet-mastered words are prioritised.</p>
      <div className="d-flex flex-wrap align-items-center gap-2">
        <Button variant="primary" type="submit" disabled={available === 0 || starting}>
          {starting ? 'Starting…' : `Start quiz (${questionCount} questions)`}
        </Button>
        {available === 0 ? <span className="small text-body-secondary mb-0">No words available for the quiz.</span> : null}
      </div>
    </form>
  );
}
