import { create } from 'zustand';

interface UIState {
  theme: 'light' | 'dark';
  sidebarVisible: boolean;
  outlineVisible: boolean;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  setSidebarVisible: (visible: boolean) => void;
  setOutlineVisible: (visible: boolean) => void;
  toggleSidebar: () => void;
  toggleOutline: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'light',
  sidebarVisible: true,
  outlineVisible: true,
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
  setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
  setOutlineVisible: (visible) => set({ outlineVisible: visible }),
  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
  toggleOutline: () => set((state) => ({ outlineVisible: !state.outlineVisible })),
}));
