import { spawn, execSync, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import https from 'https';
import type http from 'http';
import { app } from 'electron';

// ---- Cloudflare Tunnel Provider ----

const DOWNLOAD_BASE = 'https://github.com/cloudflare/cloudflared/releases/latest/download';
const PLATFORM_BINARY: Record<string, string> = {
  darwin: 'cloudflared-darwin-amd64',
  win32: 'cloudflared-windows-amd64.exe',
  linux: 'cloudflared-linux-amd64',
};

function getCloudflaredPath(): string {
  // 1. Check PATH
  const whichCmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    const result = execSync(`${whichCmd} cloudflared`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const lines = result.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && fs.existsSync(trimmed)) return trimmed;
    }
  } catch {}

  // 2. Check app data dir
  const binaryName = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  const localPath = path.join(app.getPath('userData'), binaryName);
  if (fs.existsSync(localPath)) return localPath;

  return '';
}

async function downloadCloudflared(): Promise<string> {
  const binaryName = PLATFORM_BINARY[process.platform];
  if (!binaryName) throw new Error(`不支持的平台: ${process.platform}`);

  const downloadUrl = `${DOWNLOAD_BASE}/${binaryName}`;
  const localName = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  const localPath = path.join(app.getPath('userData'), localName);

  console.log(`Downloading cloudflared from ${downloadUrl}...`);

  return new Promise((resolve, reject) => {
    https.get(downloadUrl, (res) => {
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        if (!redirectUrl) return reject(new Error('Empty redirect'));
        https.get(redirectUrl, (redirectRes) => {
          pipeResponse(redirectRes, localPath, resolve, reject);
        }).on('error', reject);
        return;
      }
      pipeResponse(res, localPath, resolve, reject);
    }).on('error', reject);
  });
}

function pipeResponse(
  res: http.IncomingMessage,
  destPath: string,
  resolve: (path: string) => void,
  reject: (err: Error) => void,
): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => {
    try {
      const data = Buffer.concat(chunks);
      fs.writeFileSync(destPath, data);
      fs.chmodSync(destPath, 0o755);
      console.log(`cloudflared downloaded to ${destPath}`);
      resolve(destPath);
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Failed to write binary'));
    }
  });
  res.on('error', reject);
}

async function ensureCloudflared(): Promise<string> {
  const existing = getCloudflaredPath();
  if (existing) {
    console.log(`Found cloudflared at ${existing}`);
    return existing;
  }
  console.log('cloudflared not found, downloading...');
  return downloadCloudflared();
}

export interface TunnelSession {
  url: string;
  stop: () => void;
}

export async function createCloudflareTunnel(localPort: number): Promise<TunnelSession> {
  const binaryPath = await ensureCloudflared();

  return new Promise((resolve, reject) => {
    const proc: ChildProcess = spawn(binaryPath, [
      'tunnel',
      '--url', `http://localhost:${localPort}`,
      '--no-autoupdate',
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let tunnelUrl = '';
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        proc.kill();
        reject(new Error('Cloudflare Tunnel 启动超时（20s），请检查网络连接'));
      }
    }, 20000);

    const onData = (data: Buffer) => {
      const output = data.toString();
      console.log('[cloudflared]', output.trim());
      const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        resolved = true;
        tunnelUrl = match[0];
        clearTimeout(timeout);
        console.log(`Cloudflare Tunnel ready: ${tunnelUrl}`);
        resolve({
          url: tunnelUrl,
          stop: () => {
            proc.kill();
            console.log('Cloudflare Tunnel closed');
          },
        });
      }
    };

    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);

    proc.on('error', (err) => {
      if (!resolved) {
        clearTimeout(timeout);
        reject(new Error(`启动 cloudflared 失败: ${err.message}`));
      }
    });

    proc.on('exit', (code) => {
      if (!resolved) {
        clearTimeout(timeout);
        reject(new Error(`cloudflared 异常退出 (code ${code})，请尝试手动安装: brew install cloudflared`));
      }
    });
  });
}
