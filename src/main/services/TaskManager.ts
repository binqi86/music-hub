import { BrowserWindow } from 'electron';
import { prisma } from '../lib/prisma';
import type { MusicProvider, TaskResult } from '../providers/types';

interface PollingTask {
  taskId: string;
  provider: MusicProvider;
  interval: number;
  onComplete: (result: TaskResult) => void;
  onError: (error: Error) => void;
}

export class TaskManager {
  private activeTimers = new Map<string, NodeJS.Timeout>();
  private activeTasks = new Map<string, PollingTask>();
  private completedTasks = new Set<string>();
  private static instance: TaskManager;

  static getInstance(): TaskManager {
    if (!TaskManager.instance) {
      TaskManager.instance = new TaskManager();
    }
    return TaskManager.instance;
  }

  startPolling(task: PollingTask, window?: BrowserWindow): void {
    this.activeTasks.set(task.taskId, task);

    const poll = async () => {
      try {
        const status = await task.provider.getTaskStatus(task.taskId);

        await prisma.musicTrack.updateMany({
          where: { taskId: task.taskId },
          data: { status: status.status },
        }).catch(() => {});

        // Notify renderer
        if (window && !window.isDestroyed()) {
          window.webContents.send('music:task-update', {
            taskId: task.taskId,
            status: status.status,
            progress: status.progress,
          });
        }

        if (status.status === 'completed') {
          if (this.completedTasks.has(task.taskId)) return;
          this.completedTasks.add(task.taskId);
          this.stopPolling(task.taskId);
          task.onComplete(status);
        } else if (status.status === 'failed') {
          this.completedTasks.add(task.taskId);
          this.stopPolling(task.taskId);
          const errMsg = status.error?.message || 'Task failed';
          await prisma.musicTrack.updateMany({
            where: { taskId: task.taskId },
            data: { status: 'failed', errorMessage: errMsg },
          }).catch(() => {});
          task.onError(new Error(errMsg));
        }
      } catch (error) {
        console.error(`Polling error for task ${task.taskId}:`, error);
      }
    };

    poll();
    const timer = setInterval(poll, task.interval);
    this.activeTimers.set(task.taskId, timer);
  }

  stopPolling(taskId: string): void {
    const timer = this.activeTimers.get(taskId);
    if (timer) {
      clearInterval(timer);
      this.activeTimers.delete(taskId);
    }
    this.activeTasks.delete(taskId);
  }

  getActiveCount(): number {
    return this.activeTimers.size;
  }
}