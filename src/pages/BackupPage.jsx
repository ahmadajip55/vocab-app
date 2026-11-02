import { useId, useState } from 'react';
import { Button } from '../components/Button.jsx';
import { ConfirmButton } from '../components/ConfirmButton.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { BACKUP_MAX_BYTES, backupFileName, createBackup, parseBackup } from '../features/backup/backup.js';
import { usePrograms } from '../hooks/usePrograms.js';
import { downloadFile } from '../lib/download.js';

const countText = (programs, words) =>
  `${programs} program${programs === 1 ? '' : 's'} and ${words} word${words === 1 ? '' : 's'}`;

/** Exports every program, word and setting to a .txt file, and restores one. */
export default function BackupPage() {
  const { programs, wordsByProgram, settings, replaceAll } = usePrograms();
  const [backup, setBackup] = useState(null); // { fileName, data } read from a chosen file
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [fileInputKey, setFileInputKey] = useState(0);
  const fileId = useId();

  const wordCount = programs.reduce((sum, program) => sum + (wordsByProgram[program.id]?.length ?? 0), 0);

  function handleExport() {
    const now = new Date();
    downloadFile(backupFileName(now), createBackup({ programs, wordsByProgram, settings }, now), 'text/plain;charset=utf-8');
    setMessage(`Exported ${countText(programs.length, wordCount)}.`);
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    setBackup(null);
    setError('');
    setMessage('');
    if (!file) return;
    try {
      if (file.size > BACKUP_MAX_BYTES) throw new Error('This file is too large to be a backup (over 10 MB).');
      setBackup({ fileName: file.name, data: parseBackup(await file.text()) });
    } catch (readError) {
      setError(readError.message);
    }
  }

  function handleRestore() {
    replaceAll(backup.data);
    setMessage(`Restored ${countText(backup.data.programs.length, backup.data.wordCount)} from ${backup.fileName}.`);
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
          </p>
        </div>
        <div>
          <Button variant="primary" onClick={handleExport} disabled={!programs.length}>
            Export to .txt
          </Button>
        </div>
      </section>

      <section className="card card-body vstack gap-3" aria-labelledby="restore-title">
        <div>
          <h2 id="restore-title" className="h5">Import</h2>
          <p className="small text-body-secondary mb-0">
            Choose a backup file exported from this app. Importing replaces every program, word and progress on this device.
          </p>
        </div>
        <div>
          <label htmlFor={fileId} className="form-label fw-semibold small mb-1">
            Backup file (.txt)
          </label>
          <input key={fileInputKey} id={fileId} className="form-control" type="file" accept=".txt,text/plain" onChange={handleFile} />
        </div>
        {error ? (
          <p className="alert alert-danger mb-0" role="alert">
            {error}
          </p>
        ) : null}
        {backup ? (
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
