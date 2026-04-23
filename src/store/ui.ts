import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n, { getInitialLanguage } from '../i18n';
import type { AppLanguage } from '../shared/language';
import {
  clampTerminalFontSize,
  DEFAULT_TERMINAL_HEIGHT,
  DEFAULT_TERMINAL_SETTINGS,
  type TerminalSettings,
} from '../shared/terminal';

export type SettingsTab = 'general' | 'editor' | 'appearance' | 'terminal' | 'shortcuts' | 'export';

export type Language = AppLanguage;
export type SidebarTab = 'files' | 'search';
export type PdfPageSize = 'A4' | 'Letter';
export type PdfMarginPreset = 'compact' | 'normal' | 'wide';
export type HtmlImageMode = 'relative' | 'base64' | 'external';

interface SearchDefaults {
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  includeGlob: string;
  excludeGlob: string;
}

interface ExportSettings {
  pdfPageSize: PdfPageSize;
  pdfMargin: PdfMarginPreset;
  pdfPrintBackground: boolean;
  pdfHeaderFooter: boolean;
  htmlImageMode: HtmlImageMode;
}

interface UIState {
  theme: 'light' | 'dark';
  sidebarVisible: boolean;
  sidebarTab: SidebarTab;
  outlineVisible: boolean;
  sidebarWidth: number;
  outlineWidth: number;
  fontSize: number;
  language: Language;
  settingsOpen: boolean;
  settingsActiveTab: SettingsTab;
  terminalVisible: boolean;
  terminalHeight: number;
  terminalSettings: TerminalSettings;
  searchDefaults: SearchDefaults;
  exportSettings: ExportSettings;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  setSidebarVisible: (visible: boolean) => void;
  setSidebarTab: (tab: SidebarTab) => void;
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
  setTerminalVisible: (visible: boolean) => void;
  toggleTerminalVisible: () => void;
  setTerminalHeight: (height: number) => void;
  setTerminalSettings: (patch: Partial<TerminalSettings>) => void;
  setSearchDefaults: (patch: Partial<SearchDefaults>) => void;
  setExportSettings: (patch: Partial<ExportSettings>) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'light',
      sidebarVisible: true,
      sidebarTab: 'files',
      outlineVisible: true,
      sidebarWidth: 240,
      outlineWidth: 220,
      fontSize: 14,
      language: getInitialLanguage(),
      settingsOpen: false,
      settingsActiveTab: 'general',
      terminalVisible: false,
      terminalHeight: DEFAULT_TERMINAL_HEIGHT,
      terminalSettings: DEFAULT_TERMINAL_SETTINGS,
      searchDefaults: {
        caseSensitive: false,
        wholeWord: false,
        useRegex: false,
        includeGlob: '**/*.md, **/*.mdx, **/*.markdown, **/*.txt',
        excludeGlob: '**/node_modules/**, **/.git/**, **/dist/**, **/release/**',
      },
      exportSettings: {
        pdfPageSize: 'A4',
        pdfMargin: 'normal',
        pdfPrintBackground: true,
        pdfHeaderFooter: false,
        htmlImageMode: 'relative',
      },
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
      setSidebarTab: (tab) => set({ sidebarTab: tab }),
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
      setTerminalVisible: (visible) => set({ terminalVisible: visible }),
      toggleTerminalVisible: () => set((state) => ({ terminalVisible: !state.terminalVisible })),
      setTerminalHeight: (height) =>
        set({
          terminalHeight: Math.max(160, Math.min(height, 720)),
        }),
      setTerminalSettings: (patch) =>
        set((state) => ({
          terminalSettings: {
            ...state.terminalSettings,
            ...patch,
            fontSize:
              patch.fontSize === undefined
                ? state.terminalSettings.fontSize
                : clampTerminalFontSize(patch.fontSize),
          },
        })),
      setSearchDefaults: (patch) =>
        set((state) => ({
          searchDefaults: {
            ...state.searchDefaults,
            ...patch,
          },
        })),
      setExportSettings: (patch) =>
        set((state) => ({
          exportSettings: {
            ...state.exportSettings,
            ...patch,
          },
        })),
    }),
    {
      name: 'typola-ui',
      onRehydrateStorage: () => (state) => {
        if (state?.language) {
          i18n.changeLanguage(state.language);
        }
      },
      partialize: (state) => ({
        theme: state.theme,
        sidebarVisible: state.sidebarVisible,
        sidebarTab: state.sidebarTab,
        outlineVisible: state.outlineVisible,
        sidebarWidth: state.sidebarWidth,
        outlineWidth: state.outlineWidth,
        fontSize: state.fontSize,
        language: state.language,
        terminalHeight: state.terminalHeight,
        terminalSettings: state.terminalSettings,
        searchDefaults: state.searchDefaults,
        exportSettings: state.exportSettings,
      }),
    }
  )
);
