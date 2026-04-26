import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from '../i18n';

export type SettingsTab = 'general' | 'editor' | 'appearance' | 'terminal' | 'shortcuts' | 'export' | 'ai';

export type Language = 'zh' | 'en';
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

export type Theme = 'light' | 'dark' | 'sepia' | 'focus' | 'arc' | 'solarized-light' | 'solarized-dark';

interface UIState {
  theme: Theme;
  sidebarVisible: boolean;
  sidebarTab: SidebarTab;
  outlineVisible: boolean;
  sidebarWidth: number;
  outlineWidth: number;
  fontSize: number;
  language: Language;
  settingsOpen: boolean;
  settingsActiveTab: SettingsTab;
  searchDefaults: SearchDefaults;
  exportSettings: ExportSettings;
  setTheme: (theme: Theme) => void;
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
  setSearchDefaults: (patch: Partial<SearchDefaults>) => void;
  setExportSettings: (patch: Partial<ExportSettings>) => void;
}

const themes: Theme[] = ['light', 'dark', 'sepia', 'focus', 'arc', 'solarized-light', 'solarized-dark'];

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
      language: 'zh',
      settingsOpen: false,
      settingsActiveTab: 'general',
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
      toggleTheme: () => set((state) => {
        const currentIndex = themes.indexOf(state.theme);
        const nextIndex = (currentIndex + 1) % themes.length;
        return { theme: themes[nextIndex] };
      }),
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
      partialize: (state) => ({
        theme: state.theme,
        sidebarVisible: state.sidebarVisible,
        sidebarTab: state.sidebarTab,
        outlineVisible: state.outlineVisible,
        sidebarWidth: state.sidebarWidth,
        outlineWidth: state.outlineWidth,
        fontSize: state.fontSize,
        language: state.language,
        searchDefaults: state.searchDefaults,
        exportSettings: state.exportSettings,
      }),
    }
  )
);

// Initialize language from store on app load
const initLanguage = useUIStore.getState().language;
if (initLanguage) {
  i18n.changeLanguage(initLanguage);
}
