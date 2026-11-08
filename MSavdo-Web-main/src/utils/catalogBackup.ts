import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { DatabaseSync } from 'node:sqlite';
import { ZipArchive } from 'archiver';

export async function createCatalogBackup(db: DatabaseSync, uploadsDir: string): Promise<{
  archivePath: string;
  cleanup: () => Promise<void>;
}> {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'msavdo-backup-'));
  const snapshotPath = path.join(directory, 'msavdo.db');
  const archivePath = path.join(directory, 'msavdo-backup.zip');
  const cleanup = () => fs.promises.rm(directory, { recursive: true, force: true });

  try {
    db.prepare('VACUUM INTO ?').run(snapshotPath);
    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.on('warning', (error) => archive.destroy(error));
    archive.file(snapshotPath, { name: 'msavdo.db' });
    archive.directory(uploadsDir, 'uploads');
    archive.append(
      'Backup contains the database and uploaded files. External image URLs are not copied.\n'
      + 'Keep this archive private: it contains orders, customer details and settings.\n',
      { name: 'README.txt' },
    );
    const output = pipeline(archive, fs.createWriteStream(archivePath, { flags: 'wx' }));
    await Promise.all([archive.finalize(), output]);
    return { archivePath, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
