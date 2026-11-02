import { describe, expect, it } from '@jest/globals';
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
  it('should restore every program, word, progress and setting when a backup is read back', () => {
    const data = sampleData();
    const [english, japanese] = data.programs;
    const text = createBackup(data, new Date('2026-11-02T08:00:00Z'));

    const restored = parseBackup(text);

    expect(restored.programs).toEqual(data.programs);
    expect(restored.settings).toEqual(data.settings);
    expect(restored.wordCount).toBe(2);
    expect(restored.exportedAt.toISOString()).toBe('2026-11-02T08:00:00.000Z');
    expect(restored.wordsByProgram[english.id][0]).toMatchObject({ term: 'Cat', meaning: 'Kucing', mastery: 4, quizPassed: 2 });
    expect(restored.wordsByProgram[japanese.id][0]).toMatchObject({ term: data.wordsByProgram[japanese.id][0].term, wordLanguage: 'ja' });
  });

  it('should write compressed ASCII text when a backup is created', () => {
    const data = sampleData();
    const many = Array.from({ length: 300 }, (_, i) => createWord({ term: `word ${i}`, meaning: `arti ${i}` }));
    data.wordsByProgram[data.programs[0].id] = many;

    const text = createBackup(data);

    expect(text.startsWith(`${BACKUP_FORMAT}:lz:`)).toBe(true);
    expect(text).toMatch(/^[\x20-\x7e]+$/); // ASCII only, safe to send or edit as text
    expect(text.length).toBeLessThan(JSON.stringify(many).length / 3);
  });

  it('should restore the programs when the backup is plain JSON', () => {
    const { programs, wordsByProgram } = sampleData();
    const text = JSON.stringify(
      { format: BACKUP_FORMAT, version: 1, programs: programs.map((p) => ({ ...p, words: wordsByProgram[p.id] })) },
      null,
      2,
    );

    const restored = parseBackup(text);

    expect(restored.programs.map((p) => p.name)).toEqual(['TOEFL', 'N5']);
    expect(restored.wordCount).toBe(2);
  });

  it('should refuse the file when the compressed data is damaged', () => {
    const text = `${BACKUP_FORMAT}:lz:not really compressed`;

    expect(() => parseBackup(text)).toThrow(/not a Vocab Cards backup/);
  });

  it('should read the backup when the text starts with a byte order mark', () => {
    const text = `\uFEFF${createBackup(sampleData())}`;

    expect(parseBackup(text).programs).toHaveLength(2);
  });

  it('should drop junk and give new ids when entries are damaged or repeated', () => {
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

  it.each([
    ['plain text', 'hello', /not a Vocab Cards backup/],
    ['other JSON', '{"programs": []}', /not a Vocab Cards backup/],
    ['a backup without a version', JSON.stringify({ format: BACKUP_FORMAT, programs: [] }), /not a Vocab Cards backup/],
    ['a newer backup', backupText({ version: 2, programs: [] }), /newer version/],
    ['a backup without programs', backupText({ programs: [{ name: ' ' }] }), /has no programs/],
  ])('should refuse the file when it is %s', (_, text, message) => {
    const parse = () => parseBackup(text);

    expect(parse).toThrow(message);
  });
});

describe('backupFileName', () => {
  it('should use the local date when naming the file', () => {
    const name = backupFileName(new Date(2026, 10, 2, 23, 30));

    expect(name).toBe('vocab-cards-backup-2026-11-02.txt');
  });
});

describe('restoring into the program list', () => {
  it('should replace every program and word when a backup is restored', () => {
    const before = programsReducer(initialProgramsState, { type: 'program/added', program: createProgram('Old') });
    const { programs, wordsByProgram } = parseBackup(createBackup(sampleData()));

    const after = programsReducer(before, { type: 'programs/replaced', programs, wordsByProgram });

    expect(after.programs.map((p) => p.name)).toEqual(['TOEFL', 'N5']);
    expect(after.wordsByProgram).toBe(wordsByProgram);
  });
});
