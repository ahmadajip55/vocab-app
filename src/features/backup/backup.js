import LZString from 'lz-string';
import { createId } from '../../lib/id.js';
import { cleanSettings, sanitizePrograms, sanitizeWords, settlePrograms, toStoredProgram, toStoredWords } from '../vocabulary/storage.js';

/**
 * A backup is a .txt file: every program with its words and progress, plus the
 * app settings, as JSON compressed with lz-string (Base64, so the file stays plain
 * ASCII text). Backups saved as plain JSON can still be restored.
 * Restoring one replaces the data on this device.
 */
export const BACKUP_FORMAT = 'vocab-cards-backup';
const BACKUP_VERSION = 1;
export const BACKUP_MAX_BYTES = 50 * 1024 * 1024;
const COMPRESSED_HEADER = `${BACKUP_FORMAT}:lz:`;

const NOT_A_BACKUP = 'This file is not a Vocab Cards backup.';

/** The text of a backup file. */
export function createBackup({ programs, wordsByProgram, settings }, exportedAt = new Date()) {
  const backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    settings: cleanSettings(settings),
    programs: programs.map((program) => ({ ...toStoredProgram(program), words: toStoredWords(wordsByProgram[program.id] ?? []) })),
  };
  return COMPRESSED_HEADER + LZString.compressToBase64(JSON.stringify(backup));
}

/** e.g. "vocab-cards-backup-2026-11-02.txt" (local date). */
export function backupFileName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${BACKUP_FORMAT}-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.txt`;
}

/**
 * Reads backup text into { programs, wordsByProgram, settings, wordCount, exportedAt }.
 * Throws an Error with a message for the user when the text cannot be restored.
 */
export function parseBackup(text) {
  let raw;
  try {
    const clean = String(text).replace(/^\uFEFF/, '').trim();
    raw = JSON.parse(
      clean.startsWith(COMPRESSED_HEADER) ? LZString.decompressFromBase64(clean.slice(COMPRESSED_HEADER.length)) : clean,
    );
  } catch {
    throw new Error(NOT_A_BACKUP);
  }
  if (raw?.format !== BACKUP_FORMAT || !Number.isInteger(raw.version) || !Array.isArray(raw.programs)) {
    throw new Error(NOT_A_BACKUP);
  }
  if (raw.version > BACKUP_VERSION) {
    throw new Error('This backup was made by a newer version of the app. Update the app and try again.');
  }

  // One program at a time, so each keeps its own words.
  const rawWords = new Map();
  const usedIds = new Set();
  for (const item of raw.programs) {
    const [program] = sanitizePrograms([item]);
    if (!program) continue;
    if (usedIds.has(program.id)) program.id = createId();
    usedIds.add(program.id);
    rawWords.set(program, item.words);
  }
  if (!rawWords.size) throw new Error('This backup has no programs.');
  const restored = settlePrograms([...rawWords.keys()], (program) => sanitizeWords(rawWords.get(program)));

  const exportedAt = Date.parse(raw.exportedAt);
  return {
    ...restored,
    settings: cleanSettings(raw.settings),
    wordCount: Object.values(restored.wordsByProgram).reduce((sum, words) => sum + words.length, 0),
    exportedAt: Number.isFinite(exportedAt) ? new Date(exportedAt) : null,
  };
}
