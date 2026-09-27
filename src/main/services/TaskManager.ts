import { BrowserWindow } from 'electron';
import { prisma } from '../lib/prisma';
import { describeUpstreamError } from '../utils/upstream-error';
import type { MusicProvider, TaskResult } from '../providers/types';

interface PollingTask {
  taskId: string;
  provider: MusicProvider;
  interval: number;
  onComplete: (result: TaskResult) => void;
  onError: (error: Error) => void;
}

/** 官方建议查询间隔为 5–10 秒；过密会撞上「当前分组容量饱和」的 429 限流 */
const MIN_POLL_INTERVAL = 5000;

export class TaskManager {
  private activeTimers = new Map<string, NodeJS.Timeout>();
  private activeTasks = new Map<string, PollingTask>();
  private completedTasks = new Set<string>();
  /** 最近一次成功轮询到的状态，请求失败时用它维持界面状态不倒退 */
  private lastKnown = new Map<string, { status: string; progress: number }>();
  private errorCounts = new Map<string, number>();
  private static instance: TaskManager;

  static getInstance(): TaskManager {
    if (!TaskManager.instance) {
      TaskManager.instance = new TaskManager();
    }
    return TaskManager.instance;
  }

  private notify(window: BrowserWindow | undefined, payload: {
    taskId: string;
    status: string;
    progress: number;
    error?: string;
  }) {
    if (window && !window.isDestroyed()) {
      window.webContents.send('music:task-update', payload);
    }
  }

  startPolling(task: PollingTask, window?: BrowserWindow): void {
    this.activeTasks.set(task.taskId, task);

    const poll = async () => {
      try {
        const status = await task.provider.getTaskStatus(task.taskId);

        this.errorCounts.delete(task.taskId);
        this.lastKnown.set(task.taskId, {
          status: status.status,
          progress: status.progress ?? 0,
        });

        await prisma.musicTrack.updateMany({
          where: { taskId: task.taskId },
          data: { status: status.status },
        }).catch(() => {});

        // Notify renderer
        this.notify(window, {
          taskId: task.taskId,
          status: status.status,
          progress: status.progress ?? 0,
        });

        if (status.status === 'completed') {
          if (this.completedTasks.has(task.taskId)) return;
          this.completedTasks.add(task.taskId);
          this.stopPolling(task.taskId);
          task.onComplete(status);
        } else if (status.status === 'failed') {
          this.completedTasks.add(task.taskId);
          this.stopPolling(task.taskId);
          // 内容政策类的失败要给出可行动的说法，否则用户只会看到一句上游原话
          const errMsg = describeUpstreamError(status.error?.message || 'Task failed', {
            taskId: task.taskId,
          });
          console.error(`Task failed ${task.taskId}: ${JSON.stringify(status.error ?? {})}`);
          await prisma.musicTrack.updateMany({
            where: { taskId: task.taskId },
            data: { status: 'failed', errorMessage: errMsg },
          }).catch(() => {});
          task.onError(new Error(errMsg));
        }
      } catch (error) {
        // 查询失败（429 限流 / 网络抖动）不能静默吞掉，否则界面会一直停在"生成中"
        const message = error instanceof Error ? error.message : String(error);
        const count = (this.errorCounts.get(task.taskId) || 0) + 1;
        this.errorCounts.set(task.taskId, count);
        console.error(`Polling error for task ${task.taskId} (#${count}):`, error);

        const known = this.lastKnown.get(task.taskId);
        if (known) {
          this.notify(window, {
            taskId: task.taskId,
            status: known.status,
            progress: known.progress,
            error: count >= 2 ? `状态查询失败（连续 ${count} 次）：${message}` : undefined,
          });
        }
      }
    };

    poll();
    const timer = setInterval(poll, Math.max(task.interval, MIN_POLL_INTERVAL));
    this.activeTimers.set(task.taskId, timer);
  }

  stopPolling(taskId: string): void {
    const timer = this.activeTimers.get(taskId);
    if (timer) {
      clearInterval(timer);
      this.activeTimers.delete(taskId);
    }
    this.activeTasks.delete(taskId);
    this.errorCounts.delete(taskId);
    this.lastKnown.delete(taskId);
  }

  getActiveCount(): number {
    return this.activeTimers.size;
  }

  isPolling(taskId: string): boolean {
    return this.activeTimers.has(taskId);
  }
}
