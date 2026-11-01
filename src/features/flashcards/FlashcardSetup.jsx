import { useMemo, useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { CheckboxField, SelectField } from '../../components/Fields.jsx';
import { getLanguage } from '../../languages/index.js';
import { meaningLanguagesOf, selectWords } from './deck.js';

/** Cards show the word on the front and its meaning in the chosen meaning language on the back. */
export function FlashcardSetup({ words, onStart }) {
  const languages = useMemo(() => meaningLanguagesOf(words), [words]);
  const [starting, setStarting] = useState(false); // missing meanings are being looked up
  const [settings, setSettings] = useState(() => ({
    meaningLanguage: languages[0]?.code ?? '',
    shuffle: true,
    onlyUnmastered: false,
  }));
  const count = useMemo(() => selectWords(words, settings).length, [words, settings]);

  const update = (field, value) => setSettings((current) => ({ ...current, [field]: value }));

  return (
    <form
      className="card card-body vstack gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (count === 0 || starting) return;
        setStarting(true);
        Promise.resolve(onStart(settings)).finally(() => setStarting(false));
      }}
    >
      <h2 className="h5 mb-0">Set up study session</h2>
      <div className="row g-3">
        <SelectField
          className="col-md-6"
          label="Meaning language"
          value={settings.meaningLanguage}
          onChange={(e) => update('meaningLanguage', e.target.value)}
          hint="The back of each card shows the meaning in this language."
        >
          {languages.map(({ code, count }) => (
            <option key={code} value={code}>
              {getLanguage(code).label} ({count} {count === 1 ? 'card' : 'cards'})
            </option>
          ))}
        </SelectField>
      </div>
      <div className="d-flex flex-wrap align-items-center gap-2">
        <CheckboxField label="Shuffle order" checked={settings.shuffle} onChange={(e) => update('shuffle', e.target.checked)} />
        <CheckboxField
          label="Only not mastered"
          checked={settings.onlyUnmastered}
          onChange={(e) => update('onlyUnmastered', e.target.checked)}
        />
      </div>
      <div className="d-flex flex-wrap align-items-center gap-2">
        <Button variant="primary" type="submit" disabled={count === 0 || starting}>
          {starting ? 'Starting…' : `Start (${count} cards)`}
        </Button>
        {count === 0 ? <span className="small text-body-secondary mb-0">No cards match these settings.</span> : null}
      </div>
    </form>
  );
}
