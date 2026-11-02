import { useId, useState } from 'react';
import { Button } from '../components/Button.jsx';
import { ConfirmButton } from '../components/ConfirmButton.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { BACKUP_MAX_BYTES, backupFileName, createBackup, parseBackup } from '../features/backup/backup.js';
import { storageUsage } from '../features/vocabulary/storage.js';
import { usePrograms } from '../hooks/usePrograms.js';
import { downloadFile } from '../lib/download.js';

const countText = (programs, words) =>
  `${programs} program${programs === 1 ? '' : 's'} and ${words} word${words === 1 ? '' : 's'}`;

/** e.g. "740 KB" or "3.6 MB". */
function sizeText(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Lets the browser paint a "busy" state before a long, blocking step. */
const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 30));

/** Exports every program, word and setting to a .txt file, and restores one. */
export default function BackupPage() {
  const { programs, wordsByProgram, settings, replaceAll } = usePrograms();
  const [backup, setBackup] = useState(null); // { fileName, data } read from a chosen file
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [fileInputKey, setFileInputKey] = useState(0);
  const [busy, setBusy] = useState(''); // what is running: 'export', 'read' or 'restore'
  const fileId = useId();

  const wordCount = programs.reduce((sum, program) => sum + (wordsByProgram[program.id]?.length ?? 0), 0);
  // Read from the storage on each render; a restore writes at once, other changes a moment later.
  const usedBytes = storageUsage() * 2;

  async function handleExport() {
    setBusy('export');
    setError('');
    setMessage('');
    await nextFrame();
    const now = new Date();
    const text = createBackup({ programs, wordsByProgram, settings }, now);
    downloadFile(backupFileName(now), text, 'text/plain;charset=utf-8');
    setMessage(`Exported ${countText(programs.length, wordCount)} (${sizeText(text.length)}).`);
    setBusy('');
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    setBackup(null);
    setError('');
    setMessage('');
    if (!file) return;
    setBusy('read');
    try {
      if (file.size > BACKUP_MAX_BYTES) throw new Error(`This file is too large to be a backup (over ${sizeText(BACKUP_MAX_BYTES)}).`);
      setBackup({ fileName: file.name, data: parseBackup(await file.text()) });
    } catch (readError) {
      setError(readError.message);
    } finally {
      setBusy('');
    }
  }

  async function handleRestore() {
    setBusy('restore');
    await nextFrame();
    const result = replaceAll(backup.data);
    setBusy('');
    if (result === 'too-large') {
      setError('This backup does not fit in the browser storage on this device. Nothing was changed.');
      return;
    }
    const restored = `Restored ${countText(backup.data.programs.length, backup.data.wordCount)} from ${backup.fileName}.`;
    setMessage(result === 'saved' ? restored : `${restored} Browser storage is unavailable, so it lasts for this visit only.`);
    setBackup(null);
    setFileInputKey((key) => key + 1);
  }

  return (
    <>
      <PageHeader title="Backup">
        Save all your programs, words and progress to a .txt file, or restore them from one, for example on another device.
      </PageHeader>

      {message ? (
        <p className="alert alert-success mb-0" role="status">
          {message}
        </p>
      ) : null}

      <section className="card card-body vstack gap-3" aria-labelledby="export-title">
        <div>
          <h2 id="export-title" className="h5">Export</h2>
          <p className="small text-body-secondary mb-0">
            {programs.length ? `This device has ${countText(programs.length, wordCount)}.` : 'There are no programs to export yet.'}
            {usedBytes ? ` They use about ${sizeText(usedBytes)} of the browser storage (usually about 5 MB per site).` : ''}
          </p>
        </div>
        <div>
          <Button variant="primary" onClick={handleExport} disabled={!programs.length || Boolean(busy)}>
            {busy === 'export' ? 'Exporting…' : 'Export to .txt'}
          </Button>
        </div>
      </section>

      <section className="card card-body vstack gap-3" aria-labelledby="restore-title">
        <div>
          <h2 id="restore-title" className="h5">Import</h2>
          <p className="small text-body-secondary mb-0">
            Choose a backup file exported from this app. Importing replaces every program, word and progress on this device.
            If the backup does not fit, nothing is changed.
          </p>
        </div>
        <div>
          <label htmlFor={fileId} className="form-label fw-semibold small mb-1">
            Backup file (.txt)
          </label>
          <input
            key={fileInputKey}
            id={fileId}
            className="form-control"
            type="file"
            accept=".txt,text/plain"
            onChange={handleFile}
            disabled={Boolean(busy)}
          />
        </div>
        {error ? (
          <p className="alert alert-danger mb-0" role="alert">
            {error}
          </p>
        ) : null}
        {busy === 'read' || busy === 'restore' ? (
          <p className="small text-body-secondary mb-0" role="status">
            {busy === 'read' ? 'Reading the backup…' : 'Importing…'}
          </p>
        ) : null}
        {backup && busy !== 'restore' ? (
          <div className="vstack gap-2">
            <p className="mb-0">
              <strong>{backup.fileName}</strong> has {countText(backup.data.programs.length, backup.data.wordCount)}
              {backup.data.exportedAt ? `, exported ${backup.data.exportedAt.toLocaleString()}` : ''}.
            </p>
            <div>
              <ConfirmButton
                prompt={programs.length ? `Replace your ${countText(programs.length, wordCount)}?` : 'Import this backup?'}
                confirmLabel="Yes, import"
                onConfirm={handleRestore}
              >
                Import and replace my data
              </ConfirmButton>
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}
