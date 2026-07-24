import path from 'path';
import fs from 'fs';
import { app } from 'electron';

const downloadsPath = app.getPath('downloads');

export async function downloadFile(url: string, filename: string): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(downloadsPath, safeFilename);

  fs.writeFileSync(filePath, buffer);
  return filePath;
}