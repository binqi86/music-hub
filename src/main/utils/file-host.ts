import fs from 'fs';
import path from 'path';
import https from 'https';
import type { PreparedUploadFile } from './local-server';

/**
 * 把本地音频托管到公开图床，得到一个**任何第三方都能立刻访问**的 URL。
 *
 * 为什么默认走这里而不是 Cloudflare 隧道：
 * 隧道用的是临时 hostname（*.trycloudflare.com），刚建好时第三方 DNS 往往还没传播，
 * 上游立刻回调取文件就会失败（表现为「上游服务返回了无效结果」）。
 * 而 uguu 这类图床是稳定域名 + 文件长驻，上传完成即可被上游抓取。
 *
 * 实测（Node https 直连，不走任何代理）：
 *   POST https://uguu.se/upload  multipart/files[] -> { success, files:[{url, filename, size}] }
 *   返回 https://d.uguu.se/xxxx.mp3 —— 保留后缀、Content-Type 正确、可直接 GET 下载。
 */

const UGUU_ENDPOINTS = [
  'https://uguu.se/upload',
  'https://uguu.se/api.php?d=upload-tool',
];

/** uguu 公开实例的单文件大小上限是 128MB，留一点余量提前报错，别等 413 */
const MAX_UPLOAD_BYTES = 120 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 120_000;

export interface HostedFile {
  url: string;
  filename: string;
  size: number;
  /** 托管来源，便于日志与错误提示区分 */
  host: 'uguu';
}

interface RawResponse {
  status: number;
  body: string;
}

/** 手工构造 multipart/form-data：不引依赖、显式不用系统代理，行为和普通 HTTP 客户端一致 */
function multipartUpload(
  endpoint: string,
  opts: { fieldName: string; filename: string; mime: string; buffer: Buffer }
): Promise<RawResponse> {
  const { fieldName, filename, mime, buffer } = opts;
  const boundary = `----MusicHubUpload${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
      `Content-Type: ${mime}\r\n\r\n`,
    'utf-8'
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
  const body = Buffer.concat([head, buffer, tail]);

  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
          'User-Agent': 'MusicHub/1.0',
          Accept: 'application/json, text/plain, */*',
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (d: Buffer) => chunks.push(d));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          // uguu 偶尔会 3xx 跳一次，跟随一层
          const loc = res.headers.location;
          if ((res.statusCode === 301 || res.statusCode === 302) && loc) {
            multipartUpload(new URL(loc, endpoint).toString(), opts).then(resolve, reject);
            return;
          }
          resolve({ status: res.statusCode ?? 0, body: raw });
        });
      }
    );

    req.on('timeout', () => req.destroy(new Error('图床上传超时')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function parseUguuResponse(raw: RawResponse): HostedFile {
  const trimmed = raw.body.trim();

  try {
    const json = JSON.parse(trimmed) as {
      success?: boolean;
      files?: Array<{ url?: string; filename?: string; size?: number }>;
      error?: string;
    };
    const file = json.files?.[0];
    if (file?.url) {
      return {
        url: file.url.replace(/\\\//g, '/'),
        filename: file.filename ?? '',
        size: file.size ?? 0,
        host: 'uguu',
      };
    }
    if (json.error) throw new Error(json.error);
  } catch (err) {
    // 不是 JSON：按纯文本格式（一行一个 URL）兜底解析
    if (err instanceof Error && err.message && !trimmed.startsWith('{')) {
      const line = trimmed.split(/\r?\n/).map((l) => l.trim()).find((l) => /^https?:\/\//.test(l));
      if (line) return { url: line, filename: line.split('/').pop() ?? '', size: 0, host: 'uguu' };
    }
    if (err instanceof Error && err.message !== 'Unexpected end of JSON input') throw err;
  }

  throw new Error(`图床返回无法解析：HTTP ${raw.status} ${trimmed.slice(0, 200)}`);
}

export async function uploadToUguu(prepared: PreparedUploadFile): Promise<HostedFile> {
  if (!fs.existsSync(prepared.servedPath)) {
    throw new Error('待上传的音频文件不存在');
  }

  const stat = fs.statSync(prepared.servedPath);
  if (stat.size === 0) {
    throw new Error('待上传的音频文件为空');
  }
  if (stat.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `音频文件过大（${(stat.size / 1024 / 1024).toFixed(1)}MB），超过图床 120MB 上限，请缩短音频或压缩音质`
    );
  }

  const buffer = fs.readFileSync(prepared.servedPath);
  // 图床按原文件名保留后缀，统一用 ASCII 名，避免中文名被转码成奇怪后缀
  const filename = `music-hub-upload${prepared.ext}`;

  let lastError: Error | null = null;
  for (const endpoint of UGUU_ENDPOINTS) {
    try {
      const raw = await multipartUpload(endpoint, {
        fieldName: 'files[]',
        filename,
        mime: prepared.mime,
        buffer,
      });

      if (raw.status === 413) {
        throw new Error('音频文件大小超过图床限制（HTTP 413）');
      }
      if (raw.status < 200 || raw.status >= 300) {
        throw new Error(`图床返回 HTTP ${raw.status}：${raw.body.slice(0, 120)}`);
      }

      const hosted = parseUguuResponse(raw);
      console.log(
        `[upload] 已托管到 ${hosted.host}: ${hosted.url} (${(stat.size / 1024 / 1024).toFixed(2)}MB)`
      );
      return hosted;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[upload] 图床端点 ${endpoint} 失败: ${lastError.message}`);
    }
  }

  throw new Error(`音频托管失败：${lastError?.message ?? '未知错误'}`);
}

/** 给隧道方案复用：路径必须落在后缀白名单里（上游只保证 .mp3 / .wav） */
export function isSafeUploadExt(ext: string): boolean {
  return ['.mp3', '.wav'].includes(path.extname(ext).toLowerCase());
}
