import { parseDelimited } from '../../lib/csv.js';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = ['xlsx', 'csv', 'tsv', 'txt'];

/**
 * Read an uploaded file into rows of cells.
 * .xlsx is parsed by read-excel-file (loaded on demand so it stays out of the
 * main bundle); .csv/.tsv/.txt are parsed here.
 */
export async function readFileRows(file) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Ukuran file melebihi 5 MB.');
  }
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (extension === 'xlsx') {
    try {
      const { default: readXlsxFile } = await import('read-excel-file');
      return await readXlsxFile(file);
    } catch {
      throw new Error('File Excel tidak dapat dibaca. Pastikan file berformat .xlsx yang valid dan tidak diberi kata sandi.');
    }
  }
  if (extension === 'xls') {
    throw new Error('Format .xls lama tidak didukung. Buka file di Excel lalu simpan sebagai .xlsx.');
  }
  if (['csv', 'tsv', 'txt'].includes(extension)) {
    return parseDelimited(await file.text());
  }
  throw new Error('Format file tidak didukung. Gunakan .xlsx atau .csv.');
}
