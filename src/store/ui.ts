import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  theme: 'light' | 'dark';
  sidebarVisible: boolean;
  outlineVisible: boolean;
  sidebarWidth: number;
  outlineWidth: number;
  fontSize: number;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  setSidebarVisible: (visible: boolean) => void;
  setOutlineVisible: (visible: boolean) => void;
  toggleSidebar: () => void;
  toggleOutline: () => void;
  setSidebarWidth: (width: number) => void;
  setOutlineWidth: (width: number) => void;
  setFontSize: (size: number) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'light',
      sidebarVisible: true,
      outlineVisible: true,
      sidebarWidth: 240,
      outlineWidth: 220,
      fontSize: 14,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
      setOutlineVisible: (visible) => set({ outlineVisible: visible }),
      toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
      toggleOutline: () => set((state) => ({ outlineVisible: !state.outlineVisible })),
      setSidebarWidth: (width) => set({ sidebarWidth: Math.max(150, Math.min(400, width)) }),
      setOutlineWidth: (width) => set({ outlineWidth: Math.max(150, Math.min(400, width)) }),
      setFontSize: (size) => set({ fontSize: Math.max(12, Math.min(24, size)) }),
    }),
    {
      name: 'typola-ui',
      partialize: (state) => ({
        theme: state.theme,
        sidebarVisible: state.sidebarVisible,
        outlineVisible: state.outlineVisible,
        sidebarWidth: state.sidebarWidth,
        outlineWidth: state.outlineWidth,
        fontSize: state.fontSize,
      }),
    }
  )
);
