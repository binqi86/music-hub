import type { IpcMain } from 'electron';
import { BrowserWindow, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { MusicService } from '../services/MusicService';
import {
  prepareUploadFile,
  cleanupPreparedFile,
  startLocalFileServer,
  stopLocalFileServer,
  type PreparedUploadFile,
} from '../utils/local-server';
import { uploadToUguu } from '../utils/file-host';
import { createCloudflareTunnel } from '../utils/cloudflare-tunnel';
import { getLocalFilePath, getFilenameFromLocalUrl } from '../utils/music-storage';
import type { UploadResult } from '../../shared/types';

/**
 * 上传链路：本地文件 -> 公网可访问 URL -> 交给上游接口。
 *
 * 默认走 uguu 图床：稳定域名、文件长驻，上传完成即可被上游抓取。
 * Cloudflare 隧道降级为「备用」，且默认关闭（设置里开启）——
 * 它的临时 hostname 需要 DNS 传播时间，第三方马上回调取文件会失败
 * （表现为「上游服务返回了无效结果」），所以只在图床不可用时兜底。
 */

/** 直连探测（系统代理不影响 https 模块），判断 URL 是否已能被外部取到 */
function fetchHead(url: string, timeoutMs: number): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const req = https.request(
        {
          hostname: u.hostname,
          port: u.port || 443,
          path: `${u.pathname}${u.search}`,
          method: 'GET',
          headers: { Range: 'bytes=0-1', 'User-Agent': 'MusicHub/1.0' },
          timeout: timeoutMs,
        },
        (res) => {
          res.resume();
          const code = res.statusCode ?? 0;
          resolve({ ok: code === 200 || code === 206, detail: `HTTP ${code}` });
        }
      );
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, detail: 'timeout' }); });
      req.on('error', (e: NodeJS.ErrnoException) => resolve({ ok: false, detail: e.code || e.message }));
      req.end();
    } catch (err) {
      resolve({ ok: false, detail: err instanceof Error ? err.message : String(err) });
    }
  });
}

/** 隧道刚建好时常要等一会儿才生效，这里轮询到真的能取出文件为止 */
async function uploadViaTunnel(
  musicService: MusicService,
  prepared: PreparedUploadFile,
  model: string
): Promise<UploadResult> {
  const { localUrl, publicPath } = await startLocalFileServer(prepared);
  const localPort = new URL(localUrl).port;
  const tunnel = await createCloudflareTunnel(parseInt(localPort, 10));

  try {
    // 用服务端给的 ASCII 路径拼接，不要把原始文件名（可能含中文/空格）拼进 URL
    const publicUrl = `${tunnel.url}${publicPath}`;
    console.log(`Public file URL via Cloudflare Tunnel: ${publicUrl}`);

    let ready = false;
    for (let i = 0; i < 12 && !ready; i++) {
      const probe = await fetchHead(publicUrl, 8000);
      console.log(`[upload] 隧道自检(${i + 1}/12): ${probe.detail} ${publicUrl}`);
      if (probe.ok) {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
    if (!ready) {
      throw new Error('Cloudflare 隧道地址在 30 秒内不可访问，上游将无法抓取该音频，请重试或改用图床上传');
    }

    // 上传任务是异步的，服务端在任务执行期间才抓取，所以隧道要活到 submitUpload 返回
    return await musicService.submitUpload(publicUrl, model);
  } finally {
    tunnel.stop();
    stopLocalFileServer();
  }
}

/**
 * 统一的上传入口：先图床，失败后按需回退到隧道。
 */
async function uploadLocalFile(
  musicService: MusicService,
  filePath: string,
  model: string
): Promise<UploadResult> {
  const prepared = await prepareUploadFile(filePath);

  try {
    let publicUrl: string;

    try {
      const hosted = await uploadToUguu(prepared);
      publicUrl = hosted.url;
    } catch (hostError) {
      const reason = hostError instanceof Error ? hostError.message : String(hostError);
      const tunnelFallback = await musicService.shouldUseTunnel();

      if (!tunnelFallback) {
        throw new Error(
          `音频托管失败：${reason}。` +
            '若需启用 Cloudflare 隧道作为备用上传方式，请在「设置 → 隧道回退」中开启。'
        );
      }

      console.warn(`[upload] 图床不可用（${reason}），回退到 Cloudflare 隧道`);
      return await uploadViaTunnel(musicService, prepared, model);
    }

    // 图床域名稳定，基本立刻可用；这里只做一次确认，失败也打印出来便于排查
    const probe = await fetchHead(publicUrl, 10000);
    console.log(`[upload] 图床地址自检: ${probe.detail} ${publicUrl}`);

    return await musicService.submitUpload(publicUrl, model);
  } finally {
    cleanupPreparedFile(prepared);
  }
}

export function registerMusicHandlers(ipcMain: IpcMain, window: BrowserWindow | null) {
  const musicService = new MusicService(window);

  ipcMain.handle('music:generate', async (_event, params) => {
    try {
      return await musicService.submitGeneration(params);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Generation failed');
    }
  });

  ipcMain.handle('music:cover', async (_event, params) => {
    try {
      return await musicService.submitCover(params);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Cover failed');
    }
  });

  ipcMain.handle('music:extend', async (_event, params) => {
    try {
      return await musicService.submitExtend(params);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Extend failed');
    }
  });

  ipcMain.handle('music:stems', async (_event, params) => {
    try {
      return await musicService.submitStems(params);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Stem separation failed');
    }
  });

  ipcMain.handle('music:mv', async (_event, params) => {
    try {
      return await musicService.submitMV(params);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'MV generation failed');
    }
  });

  ipcMain.handle('music:task-status', async (_event, taskId) => {
    try {
      return await musicService.getTaskStatus(taskId);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to get task status');
    }
  });

  ipcMain.handle('music:aligned-lyrics', async (_event, params: { taskId: string; audioIndex?: number }) => {
    try {
      return await musicService.generateAlignedLyrics(params);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Aligned lyrics failed');
    }
  });

  // 本地上传：弹窗选文件
  ipcMain.handle('music:upload-audio', async (_event, params?: { model?: string }) => {
    const win = window || BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error('No window available');

    try {
      const result = await dialog.showOpenDialog(win, {
        title: '选择音频文件',
        filters: [
          { name: '音频文件', extensions: ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac'] },
          { name: '所有文件', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return await uploadLocalFile(musicService, result.filePaths[0], params?.model || 'suno');
    } catch (error) {
      stopLocalFileServer();
      throw new Error(error instanceof Error ? error.message : 'Upload failed');
    }
  });

  // 重新上传：直接用曲库中已下载到本地的音频，换取一个全新的 clip_id
  ipcMain.handle(
    'music:upload-local-audio',
    async (_event, params: { localAudioUrl: string; model?: string }) => {
      try {
        const filename = path.basename(getFilenameFromLocalUrl(params.localAudioUrl));
        const filePath = getLocalFilePath(filename);
        if (!fs.existsSync(filePath)) {
          throw new Error('本地音频文件不存在，请先下载该曲目后再翻唱');
        }
        return await uploadLocalFile(musicService, filePath, params.model || 'suno');
      } catch (error) {
        stopLocalFileServer();
        throw new Error(error instanceof Error ? error.message : 'Upload failed');
      }
    }
  );
}