import { describe, expect, test } from '@jest/globals';
import { BACKUP_FORMAT, backupFileName, createBackup, parseBackup } from '../../../features/backup/backup.js';
import { createWord } from '../../../features/vocabulary/model.js';
import { createProgram, initialProgramsState, programsReducer } from '../../../features/vocabulary/programs.js';

function sampleData() {
  const english = createProgram('TOEFL', 'en', ['B2'], { masteredLevel: 20, passedLevel: 10 });
  const japanese = createProgram('N5', 'ja', ['N5']);
  const cat = { ...createWord({ term: 'cat', meaning: 'kucing', meaningLanguage: 'id' }), mastery: 4, quizPassed: 2 };
  const neko = createWord({ term: 'neko', meaning: 'cat', wordLanguage: 'ja', meaningLanguage: 'en' });
  return {
    programs: [english, japanese],
    wordsByProgram: { [english.id]: [cat], [japanese.id]: [neko] },
    settings: { masteredLevel: 20, passedLevel: 10 },
  };
}

const backupText = (data) => JSON.stringify({ format: BACKUP_FORMAT, version: 1, ...data });

describe('createBackup and parseBackup', () => {
  test('a backup restores every program, word, progress and setting', () => {
    const data = sampleData();
    const text = createBackup(data, new Date('2026-11-02T08:00:00Z'));

    const restored = parseBackup(text);

    expect(restored.programs).toEqual(data.programs);
    expect(restored.settings).toEqual(data.settings);
    expect(restored.wordCount).toBe(2);
    expect(restored.exportedAt.toISOString()).toBe('2026-11-02T08:00:00.000Z');
    const [english, japanese] = data.programs;
    expect(restored.wordsByProgram[english.id][0]).toMatchObject({ term: 'Cat', meaning: 'Kucing', mastery: 4, quizPassed: 2 });
    expect(restored.wordsByProgram[japanese.id][0]).toMatchObject({ term: data.wordsByProgram[japanese.id][0].term, wordLanguage: 'ja' });
  });

  test('the backup is readable text', () => {
    const text = createBackup(sampleData());

    expect(text).toContain(`"format": "${BACKUP_FORMAT}"`);
    expect(text.split('\n').length).toBeGreaterThan(10);
  });

  test('ignores a byte order mark', () => {
    const text = `\uFEFF${createBackup(sampleData())}`;

    expect(parseBackup(text).programs).toHaveLength(2);
  });

  test('repairs damaged entries and duplicate ids', () => {
    const text = backupText({
      programs: [
        null,
        { name: '' },
        { id: 'same', name: 'A', wordLanguage: 'ja', words: [{ term: 'cat', wordLanguage: 'en' }, 'junk'] },
        { id: 'same', name: 'B', wordLanguage: 'en', masteredLevel: 500 },
      ],
    });

    const restored = parseBackup(text);

    expect(restored.programs.map((p) => p.name)).toEqual(['A', 'B']);
    expect(restored.programs[1].id).not.toBe('same');
    expect(restored.programs[1].masteredLevel).toBe(100);
    expect(restored.wordsByProgram.same).toHaveLength(1);
    expect(restored.wordsByProgram.same[0].wordLanguage).toBe('ja');
    expect(restored.wordsByProgram[restored.programs[1].id]).toEqual([]);
    expect(restored.settings).toEqual({ masteredLevel: 100, passedLevel: 100 });
    expect(restored.exportedAt).toBeNull();
  });

  test.each([
    ['plain text', 'hello', /not a Vocab Cards backup/],
    ['other JSON', '{"programs": []}', /not a Vocab Cards backup/],
    ['a backup without a version', JSON.stringify({ format: BACKUP_FORMAT, programs: [] }), /not a Vocab Cards backup/],
    ['a newer backup', backupText({ version: 2, programs: [] }), /newer version/],
    ['a backup without programs', backupText({ programs: [{ name: ' ' }] }), /has no programs/],
  ])('refuses %s', (_, text, message) => {
    expect(() => parseBackup(text)).toThrow(message);
  });
});

describe('backupFileName', () => {
  test('uses the local date', () => {
    const name = backupFileName(new Date(2026, 10, 2, 23, 30));

    expect(name).toBe('vocab-cards-backup-2026-11-02.txt');
  });
});

describe('restoring into the program list', () => {
  test('replaces every program and word', () => {
    const before = programsReducer(initialProgramsState, { type: 'program/added', program: createProgram('Old') });
    const { programs, wordsByProgram } = parseBackup(createBackup(sampleData()));

    const after = programsReducer(before, { type: 'programs/replaced', programs, wordsByProgram });

    expect(after.programs.map((p) => p.name)).toEqual(['TOEFL', 'N5']);
    expect(after.wordsByProgram).toBe(wordsByProgram);
  });
});
