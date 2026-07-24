import http from 'http';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

let server: http.Server | null = null;
let currentPort = 0;

export function startLocalFileServer(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (server) {
      stopLocalFileServer();
    }

    const filename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4',
      '.ogg': 'audio/ogg',
      '.flac': 'audio/flac',
      '.aac': 'audio/aac',
      '.mp4': 'video/mp4',
    };

    server = http.createServer((req, res) => {
      if (req.url === `/${filename}`) {
        const stat = fs.statSync(filePath);
        res.writeHead(200, {
          'Content-Type': mimeTypes[ext] || 'application/octet-stream',
          'Content-Length': stat.size,
          'Access-Control-Allow-Origin': '*',
        });
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server?.address();
      if (addr && typeof addr === 'object') {
        currentPort = addr.port;
        const url = `http://127.0.0.1:${currentPort}/${filename}`;
        console.log(`Local file server started at ${url}`);
        resolve(url);
      } else {
        reject(new Error('Failed to start server'));
      }
    });

    server.on('error', reject);
  });
}

export function stopLocalFileServer() {
  if (server) {
    server.close();
    server = null;
    currentPort = 0;
  }
}