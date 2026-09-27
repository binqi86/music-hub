import { create } from 'zustand';

export interface ActiveTask {
  taskId: string;
  model: string;
  mode: string;
  status: string;
  progress: number;
  createdAt: number;
  trackId?: string;
  /** 轮询失败等非致命错误，显示在任务卡上，但不影响继续轮询 */
  error?: string;
}

interface GenerationStore {
  activeTasks: ActiveTask[];
  /** 任意任务到达终态时自增，页面可据此刷新数据（如曲库、详情页子曲目） */
  revision: number;
  addTask: (task: ActiveTask) => void;
  updateTask: (taskId: string, updates: Partial<ActiveTask>) => void;
  removeTask: (taskId: string) => void;
  bumpRevision: () => void;
  clearCompleted: () => void;
}

export const isTerminalStatus = (status: string) =>
  status === 'completed' || status === 'failed';

export const useGenerationStore = create<GenerationStore>((set) => ({
  activeTasks: [],
  revision: 0,

  addTask: (task) =>
    set((state) => {
      const exists = state.activeTasks.some((t) => t.taskId === task.taskId);
      if (exists) {
        return {
          activeTasks: state.activeTasks.map((t) => (t.taskId === task.taskId ? { ...t, ...task } : t)),
        };
      }
      return { activeTasks: [task, ...state.activeTasks] };
    }),

  updateTask: (taskId, updates) =>
    set((state) => ({
      activeTasks: state.activeTasks.map((t) =>
        t.taskId === taskId ? { ...t, ...updates } : t
      ),
    })),

  removeTask: (taskId) =>
    set((state) => ({
      activeTasks: state.activeTasks.filter((t) => t.taskId !== taskId),
    })),

  bumpRevision: () => set((state) => ({ revision: state.revision + 1 })),

  clearCompleted: () =>
    set((state) => ({
      activeTasks: state.activeTasks.filter((t) => !isTerminalStatus(t.status)),
    })),
}));
