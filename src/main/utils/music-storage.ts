import path from 'path';
import fs from 'fs';
import { app } from 'electron';

const MUSIC_DIR_NAME = 'music-storage';

export function getMusicStoragePath(): string {
  const storagePath = path.join(app.getPath('userData'), MUSIC_DIR_NAME);
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }
  return storagePath;
}

export function getLocalAudioUrl(filename: string): string {
  return `local-music:///${encodeURIComponent(filename)}`;
}

export function getLocalFilePath(filename: string): string {
  return path.join(getMusicStoragePath(), filename);
}

export async function downloadToMusicStorage(url: string, filename: string, retries: number = 3): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download audio: ${response.statusText} (${response.status})`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const filePath = getLocalFilePath(filename);

      fs.writeFileSync(filePath, buffer);
      return filePath;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw lastError!;
}

export function deleteLocalFile(filename: string): void {
  const filePath = getLocalFilePath(filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function deleteLocalFileByUrl(localAudioUrl: string): void {
  // localAudioUrl format: local-music:///encoded-filename.mp3
  const filename = decodeURIComponent(localAudioUrl.replace('local-music:///', ''));
  deleteLocalFile(filename);
}

export function getFilenameFromUrl(url: string, trackId: string, index: number = 0, title?: string | null): string {
  const ext = url.match(/\.(mp3|wav|ogg|flac|m4a|webm)/i)?.[1] || 'mp3';
  const base = title
    ? `${title}-${trackId}`
    : `${trackId}-${index}`;
  return `${base}.${ext}`;
}

export function getFilenameFromLocalUrl(localAudioUrl: string): string {
  // localAudioUrl format: local-music:///encoded-filename.mp3
  return decodeURIComponent(localAudioUrl.replace('local-music:///', ''));
}