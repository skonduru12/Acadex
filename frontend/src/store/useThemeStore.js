import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const PRESETS = {
  dark: {
    name: 'Dark (Default)',
    bgPrimary:   '#030712',
    bgSecondary: '#111827',
    bgTertiary:  '#1f2937',
    accent:      '#6366f1',
    colorTask:   '#3b82f6',
    colorPersonal: '#10b981',
    colorCanvas: '#f59e0b',
    colorTest:   '#ef4444',
    colorBlock:  '#8b5cf6',
    colorGoogle: '#ec4899',
  },
  midnight: {
    name: 'Midnight Blue',
    bgPrimary:   '#0f0f23',
    bgSecondary: '#1a1a3e',
    bgTertiary:  '#252550',
    accent:      '#818cf8',
    colorTask:   '#60a5fa',
    colorPersonal: '#34d399',
    colorCanvas: '#fbbf24',
    colorTest:   '#f87171',
    colorBlock:  '#a78bfa',
    colorGoogle: '#f472b6',
  },
  slate: {
    name: 'Slate',
    bgPrimary:   '#0f172a',
    bgSecondary: '#1e293b',
    bgTertiary:  '#334155',
    accent:      '#38bdf8',
    colorTask:   '#818cf8',
    colorPersonal: '#4ade80',
    colorCanvas: '#fb923c',
    colorTest:   '#f43f5e',
    colorBlock:  '#a78bfa',
    colorGoogle: '#e879f9',
  },
  forest: {
    name: 'Forest',
    bgPrimary:   '#0a1a0f',
    bgSecondary: '#132218',
    bgTertiary:  '#1e3a26',
    accent:      '#4ade80',
    colorTask:   '#34d399',
    colorPersonal: '#a3e635',
    colorCanvas: '#fbbf24',
    colorTest:   '#fb7185',
    colorBlock:  '#2dd4bf',
    colorGoogle: '#818cf8',
  },
  ocean: {
    name: 'Ocean',
    bgPrimary:   '#030d1a',
    bgSecondary: '#071e3d',
    bgTertiary:  '#0c2d5e',
    accent:      '#38bdf8',
    colorTask:   '#0ea5e9',
    colorPersonal: '#06b6d4',
    colorCanvas: '#f59e0b',
    colorTest:   '#f43f5e',
    colorBlock:  '#6366f1',
    colorGoogle: '#a78bfa',
  },
  rose: {
    name: 'Rose',
    bgPrimary:   '#1a0a0f',
    bgSecondary: '#2d1120',
    bgTertiary:  '#3f1a2e',
    accent:      '#fb7185',
    colorTask:   '#f472b6',
    colorPersonal: '#34d399',
    colorCanvas: '#fbbf24',
    colorTest:   '#f87171',
    colorBlock:  '#c084fc',
    colorGoogle: '#818cf8',
  },
};

const useThemeStore = create(
  persist(
    (set) => ({
      activePreset: 'dark',
      colors: { ...PRESETS.dark },

      applyPreset: (presetKey) => {
        const preset = PRESETS[presetKey];
        if (!preset) return;
        set({ activePreset: presetKey, colors: { ...preset } });
      },

      setColor: (key, value) =>
        set((state) => ({
          activePreset: 'custom',
          colors: { ...state.colors, [key]: value },
        })),

      reset: () => set({ activePreset: 'dark', colors: { ...PRESETS.dark } }),
    }),
    { name: 'acadex-theme' }
  )
);

export default useThemeStore;
