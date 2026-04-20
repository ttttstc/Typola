import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from '../i18n';

export type SettingsTab = 'general' | 'editor' | 'appearance' | 'terminal' | 'shortcuts';

export type Language = 'zh' | 'en';

interface UIState {
  theme: 'light' | 'dark';
  sidebarVisible: boolean;
  outlineVisible: boolean;
  sidebarWidth: number;
  outlineWidth: number;
  fontSize: number;
  language: Language;
  settingsOpen: boolean;
  settingsActiveTab: SettingsTab;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  setSidebarVisible: (visible: boolean) => void;
  setOutlineVisible: (visible: boolean) => void;
  toggleSidebar: () => void;
  toggleOutline: () => void;
  setSidebarWidth: (width: number) => void;
  setOutlineWidth: (width: number) => void;
  setFontSize: (size: number) => void;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  setSettingsOpen: (open: boolean) => void;
  setSettingsActiveTab: (tab: SettingsTab) => void;
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
      language: 'zh',
      settingsOpen: false,
      settingsActiveTab: 'general',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
      setOutlineVisible: (visible) => set({ outlineVisible: visible }),
      toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
      toggleOutline: () => set((state) => ({ outlineVisible: !state.outlineVisible })),
      setSidebarWidth: (width) => set({ sidebarWidth: Math.max(150, Math.min(400, width)) }),
      setOutlineWidth: (width) => set({ outlineWidth: Math.max(150, Math.min(400, width)) }),
      setFontSize: (size) => set({ fontSize: Math.max(12, Math.min(24, size)) }),
      setLanguage: (lang) => {
        i18n.changeLanguage(lang);
        set({ language: lang });
      },
      toggleLanguage: () => set((state) => {
        const newLang = state.language === 'zh' ? 'en' : 'zh';
        i18n.changeLanguage(newLang);
        return { language: newLang };
      }),
      setSettingsOpen: (open) => set({ settingsOpen: open }),
      setSettingsActiveTab: (tab) => set({ settingsActiveTab: tab }),
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
        language: state.language,
      }),
    }
  )
);

// Initialize language from store on app load
const initLanguage = useUIStore.getState().language;
if (initLanguage) {
  i18n.changeLanguage(initLanguage);
}
