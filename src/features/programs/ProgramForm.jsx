import { useId, useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { CheckboxField, SelectField, TextField } from '../../components/Fields.jsx';
import { usePrograms } from '../../hooks/usePrograms.js';
import { DEFAULT_LANGUAGES, LANGUAGE_OPTIONS } from '../vocabulary/model.js';
import {
  PROGRAM_NAME_LIMIT,
  levelOptionsFor,
  validateProgramLevels,
  validateProgramName,
} from '../vocabulary/programs.js';

/** Creates a program. Only the Home page offers it. */
export function ProgramForm() {
  const { programs, addProgram } = usePrograms();
  const [name, setName] = useState('');
  const [wordLanguage, setWordLanguage] = useState(DEFAULT_LANGUAGES.wordLanguage);
  const [levels, setLevels] = useState([]);
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
    };
    if (nextErrors.name || nextErrors.levels) {
      setErrors(nextErrors);
      return;
    }
    addProgram(name, wordLanguage, levels);
    setName('');
    setLevels([]);
    setErrors({});
  }

  return (
    <form className="card card-body" onSubmit={handleSubmit} noValidate>
      <div className="row g-3">
        <TextField
          className="col-md-6"
          label="New program"
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

        <div className="col-12">
          <Button variant="primary" type="submit">
            Add program
          </Button>
        </div>
      </div>
    </form>
  );
}
