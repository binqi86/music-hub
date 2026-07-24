import { create } from 'zustand';

interface ActiveTask {
  taskId: string;
  model: string;
  mode: string;
  status: string;
  progress: number;
  createdAt: number;
  trackId?: string;
}

interface GenerationStore {
  activeTasks: ActiveTask[];
  addTask: (task: ActiveTask) => void;
  updateTask: (taskId: string, updates: Partial<ActiveTask>) => void;
  removeTask: (taskId: string) => void;
  clearCompleted: () => void;
}

export const useGenerationStore = create<GenerationStore>((set) => ({
  activeTasks: [],

  addTask: (task) =>
    set((state) => ({ activeTasks: [task, ...state.activeTasks] })),

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

  clearCompleted: () =>
    set((state) => ({
      activeTasks: state.activeTasks.filter(
        (t) => t.status === 'submitted' || t.status === 'pending'
      ),
    })),
}));