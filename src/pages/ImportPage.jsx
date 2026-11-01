import { PageHeader } from '../components/PageHeader.jsx';
import { ImportPanel } from '../features/import/ImportPanel.jsx';

export default function ImportPage() {
  return (
    <>
      <PageHeader title="Import words">
        Add many words at once from an Excel file, CSV, or copied spreadsheet text. You can review the results before
        saving them.
      </PageHeader>
      <ImportPanel />
    </>
  );
}
