import { create } from 'zustand';

interface ThemeStore {
  isDark: boolean;
  toggle: () => void;
  setTheme: (dark: boolean) => void;
}

function applyTheme(dark: boolean) {
  const root = document.documentElement;
  if (dark) {
    root.classList.remove('light');
    root.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  } else {
    root.classList.remove('dark');
    root.classList.add('light');
    localStorage.setItem('theme', 'light');
  }
}

// Initialize from localStorage or system preference
function getInitialTheme(): boolean {
  const saved = localStorage.getItem('theme');
  if (saved) return saved === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

const initialDark = getInitialTheme();
applyTheme(initialDark);

export const useThemeStore = create<ThemeStore>((set) => ({
  isDark: initialDark,
  toggle: () =>
    set((state) => {
      const newDark = !state.isDark;
      applyTheme(newDark);
      return { isDark: newDark };
    }),
  setTheme: (dark: boolean) => {
    applyTheme(dark);
    set({ isDark: dark });
  },
}));