import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { execSync } from 'child_process';

/**
 * 上传前置处理 + 临时 HTTP 服务。
 *
 * 两个必须注意的点（都是实际踩过的坑）：
 * 1. 对外文件名必须是 **纯 ASCII**。中文 + 空格的名字会被客户端百分号编码，
 *    Node 的 req.url 拿到的是**未解码**的原始路径，两者永远不相等 → 上游抓取得到 404。
 * 2. 上游只保证支持常见后缀（文档明确 `.mp3` / `.wav`）。
 *    其它格式（.m4a/.flac/.ogg/.aac）先用 ffmpeg 转成 mp3。
 */

/** 上游文档明确支持的音频后缀 */
const UPLOAD_SAFE_EXTS = new Set(['.mp3', '.wav']);

const MIME_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.mp4': 'video/mp4',
};

/** 准备好的待上传文件——图床和隧道两条链路共用这一段 */
export interface PreparedUploadFile {
  /** 实际要上传的路径（可能是转码产物） */
  servedPath: string;
  /** 原始路径 */
  originalPath: string;
  mime: string;
  /** 含点后缀，例如 .mp3 */
  ext: string;
  /** servedPath 是否为临时文件，需要用完清理 */
  isTemp: boolean;
}

export interface LocalFileServer {
  /** 本地调试地址 */
  localUrl: string;
  /** 对外的 ASCII 路径，例如 /audio.mp3 */
  publicPath: string;
}

let server: http.Server | null = null;

function resolveFfmpeg(): string {
  const candidates = [
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  try {
    const cmd = process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg';
    const out = execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim()
      .split('\n')[0]
      .trim();
    if (out && fs.existsSync(out)) return out;
  } catch {
    /* 未安装 */
  }
  return '';
}

/** 用 ffmpeg 把任意音频转成 mp3，返回临时文件路径 */
function transcodeToMp3(input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ffmpeg = resolveFfmpeg();
    if (!ffmpeg) {
      reject(
        new Error(
          '当前文件的格式不在接口支持范围内（仅保证 .mp3 / .wav），且未找到 ffmpeg 无法自动转码。' +
            '请安装 ffmpeg（brew install ffmpeg）或改用 mp3/wav 文件。'
        )
      );
      return;
    }

    const out = path.join(
      os.tmpdir(),
      `music-hub-upload-${process.pid}-${Date.now()}.mp3`
    );
    console.log(`[upload] 转码中: ${path.basename(input)} -> mp3`);

    const proc = spawn(
      ffmpeg,
      ['-y', '-i', input, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', out],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );

    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on('error', (err) => reject(new Error(`ffmpeg 启动失败: ${err.message}`)));
    proc.on('exit', (code) => {
      if (code === 0 && fs.existsSync(out)) {
        console.log(`[upload] 转码完成: ${out}`);
        resolve(out);
      } else {
        const tail = stderr.split('\n').filter(Boolean).slice(-3).join(' | ').trim();
        reject(new Error(`音频转码失败（ffmpeg 退出码 ${code}）：${tail}`));
      }
    });
  });
}

/**
 * 上传前置：确认文件存在，并在后缀不在白名单时转成 mp3。
 * 返回的临时文件必须由调用方用 cleanupPreparedFile 清理。
 */
export async function prepareUploadFile(filePath: string): Promise<PreparedUploadFile> {
  if (!fs.existsSync(filePath)) {
    throw new Error('音频文件不存在');
  }

  const ext = path.extname(filePath).toLowerCase();

  if (UPLOAD_SAFE_EXTS.has(ext)) {
    return {
      servedPath: filePath,
      originalPath: filePath,
      mime: MIME_TYPES[ext] || 'application/octet-stream',
      ext,
      isTemp: false,
    };
  }

  const transcoded = await transcodeToMp3(filePath);
  return {
    servedPath: transcoded,
    originalPath: filePath,
    mime: MIME_TYPES['.mp3'],
    ext: '.mp3',
    isTemp: true,
  };
}

/** 清理转码产物 */
export function cleanupPreparedFile(prepared?: PreparedUploadFile | null) {
  if (!prepared?.isTemp) return;
  try {
    fs.unlinkSync(prepared.servedPath);
  } catch {
    /* 忽略 */
  }
}

/** 把已准备好的文件通过临时 HTTP 服务暴露出来，供 Cloudflare 隧道回退方案使用 */
export async function startLocalFileServer(prepared: PreparedUploadFile): Promise<LocalFileServer> {
  stopLocalFileServer();

  if (!fs.existsSync(prepared.servedPath)) {
    throw new Error('音频文件不存在');
  }

  const publicPath = `/audio${prepared.ext}`;
  const mime = prepared.mime;

  return new Promise<LocalFileServer>((resolve, reject) => {
    server = http.createServer((req, res) => {
      // req.url 是未解码的原始路径；中文/空格会被客户端百分号编码，
      // 所以解码后再比对，同时也兼容已经是 ASCII 的路径。
      const rawPath = (req.url || '').split('?')[0];
      let decoded = rawPath;
      try {
        decoded = decodeURIComponent(rawPath);
      } catch {
        /* 保持原样 */
      }

      if (decoded !== publicPath && rawPath !== publicPath) {
        res.writeHead(404);
        res.end();
        return;
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405);
        res.end();
        return;
      }

      let stat: fs.Stats;
      try {
        stat = fs.statSync(prepared.servedPath);
      } catch {
        res.writeHead(404);
        res.end();
        return;
      }

      const commonHeaders = {
        'Content-Type': mime,
        'Access-Control-Allow-Origin': '*',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
      };

      if (req.method === 'HEAD') {
        res.writeHead(200, { ...commonHeaders, 'Content-Length': stat.size });
        res.end();
        return;
      }

      const size = stat.size;
      const rangeMatch = req.headers.range ? /^bytes=(\d*)-(\d*)$/.exec(req.headers.range) : null;

      if (rangeMatch) {
        const start = rangeMatch[1] ? parseInt(rangeMatch[1], 10) : 0;
        let end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : size - 1;
        if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
          res.writeHead(416, { 'Content-Range': `bytes */${size}` });
          res.end();
          return;
        }
        end = Math.min(end, size - 1);
        res.writeHead(206, {
          ...commonHeaders,
          'Content-Length': end - start + 1,
          'Content-Range': `bytes ${start}-${end}/${size}`,
        });
        fs.createReadStream(prepared.servedPath, { start, end }).pipe(res);
        return;
      }

      res.writeHead(200, { ...commonHeaders, 'Content-Length': size });
      fs.createReadStream(prepared.servedPath).pipe(res);
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server?.address();
      if (addr && typeof addr === 'object') {
        const localUrl = `http://127.0.0.1:${addr.port}${publicPath}`;
        console.log(`Local file server started: ${localUrl} (public path ${publicPath})`);
        resolve({ localUrl, publicPath });
      } else {
        reject(new Error('Failed to start local file server'));
      }
    });

    server.on('error', reject);
  });
}

export function stopLocalFileServer() {
  if (server) {
    server.close();
    server = null;
  }
}
