import { useId, useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { CollapsibleCard } from '../../components/CollapsibleCard.jsx';
import { CheckboxField, SelectField, TextField } from '../../components/Fields.jsx';
import { usePrograms } from '../../hooks/usePrograms.js';
import { DEFAULT_LANGUAGES, LANGUAGE_OPTIONS, TARGET_LIMITS } from '../vocabulary/model.js';
import {
  PROGRAM_NAME_LIMIT,
  levelOptionsFor,
  validateProgramLevels,
  validateProgramName,
  validateProgramTarget,
} from '../vocabulary/programs.js';

const TARGET_FIELDS = [
  { key: 'masteredLevel', label: 'Mastery target', hint: 'Correct answers in a row to master a word.' },
  { key: 'passedLevel', label: 'Quiz passed target', hint: 'Correct quiz answers to pass a word.' },
];

/** The targets as form text, starting from the last ones used. */
const targetDraft = (settings) => ({
  masteredLevel: String(settings.masteredLevel),
  passedLevel: String(settings.passedLevel),
});

/** Creates a program. Only the Home page offers it. It can be shown or hidden; it starts open while there are no programs. */
export function ProgramForm() {
  const { programs, settings, addProgram } = usePrograms();
  const [name, setName] = useState('');
  const [wordLanguage, setWordLanguage] = useState(DEFAULT_LANGUAGES.wordLanguage);
  const [levels, setLevels] = useState([]);
  const [targets, setTargets] = useState(() => targetDraft(settings));
  const [errors, setErrors] = useState({});
  const levelsId = useId();

  const levelOptions = levelOptionsFor(wordLanguage);
  const isJlpt = wordLanguage === 'ja';

  function toggleLevel(level) {
    setLevels((current) => (current.includes(level) ? current.filter((item) => item !== level) : [...current, level]));
    setErrors((current) => ({ ...current, levels: undefined }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = {
      name: validateProgramName(name, programs) || undefined,
      levels: validateProgramLevels(levels, wordLanguage) || undefined,
      ...Object.fromEntries(TARGET_FIELDS.map(({ key }) => [key, validateProgramTarget(targets[key]) || undefined])),
    };
    if (Object.values(nextErrors).some(Boolean)) {
      setErrors(nextErrors);
      return;
    }
    const program = addProgram(name, wordLanguage, levels, {
      masteredLevel: Number(targets.masteredLevel),
      passedLevel: Number(targets.passedLevel),
    });
    setName('');
    setLevels([]);
    setTargets(targetDraft(program));
    setErrors({});
  }

  return (
    <CollapsibleCard title="New program" storageKey="vocab-app:new-program-open" defaultOpen={programs.length === 0}>
      <form onSubmit={handleSubmit} noValidate aria-label="New program">
        <div className="row g-3">
          <TextField
            className="col-md-6"
            label="Program name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setErrors((current) => ({ ...current, name: undefined }));
            }}
            error={errors.name}
            maxLength={PROGRAM_NAME_LIMIT + 10}
            autoComplete="off"
            placeholder="e.g. Daily Japanese, TOEFL, Business English"
            hint="Each program has its own word list and learning progress."
          />
          <SelectField
            className="col-md-6"
            label="Word language"
            value={wordLanguage}
            onChange={(event) => {
              setWordLanguage(event.target.value);
              setLevels([]); // CEFR and JLPT levels do not carry over
              setErrors((current) => ({ ...current, levels: undefined }));
            }}
            hint="All words in this program use this language. It cannot be changed later."
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>

          <fieldset
            className="col-12"
            aria-describedby={errors.levels ? `${levelsId}-error` : `${levelsId}-hint`}
            aria-invalid={errors.levels ? 'true' : undefined}
          >
            <legend className="form-label fw-semibold small mb-1 float-none">{isJlpt ? 'JLPT level' : 'CEFR level'}</legend>
            <div className="d-flex flex-wrap gap-3">
              {levelOptions.map((level) => (
                <CheckboxField
                  key={level}
                  label={level}
                  checked={levels.includes(level)}
                  onChange={() => toggleLevel(level)}
                />
              ))}
            </div>
            {errors.levels ? (
              <p className="invalid-feedback d-block fw-semibold mb-0" id={`${levelsId}-error`} role="alert">
                {errors.levels}
              </p>
            ) : (
              <p className="form-text mb-0" id={`${levelsId}-hint`}>
                Choose one or more levels.
              </p>
            )}
          </fieldset>

          {TARGET_FIELDS.map(({ key, label, hint }) => (
            <TextField
              key={key}
              className="col-sm-6"
              label={label}
              type="number"
              inputMode="numeric"
              min={TARGET_LIMITS.min}
              max={TARGET_LIMITS.max}
              step={1}
              value={targets[key]}
              onChange={(event) => {
                setTargets((current) => ({ ...current, [key]: event.target.value }));
                setErrors((current) => ({ ...current, [key]: undefined }));
              }}
              error={errors[key]}
              hint={`${hint} ${TARGET_LIMITS.min}-${TARGET_LIMITS.max}. Cannot be changed later.`}
            />
          ))}

          <div className="col-12">
            <Button variant="primary" type="submit">
              Add program
            </Button>
          </div>
        </div>
      </form>
    </CollapsibleCard>
  );
}
