import { useState, useRef, useEffect, useCallback, type MouseEvent as ReactMouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorStore } from '../store/editor';
import { useSearchStore } from '../store/search';
import type { NativeMenuAction } from '../shared/menu';
import { useWorkspaceStore } from '../store/workspace';
import { useUIStore } from '../store/ui';
import { openNewTerminalTab, toggleTerminalPanel } from '../store/terminal';
import {
  applyBlockFormat,
  applyInlineFormat,
  applyLink,
  getActiveLinkHref,
  hasEditorSelection,
  isEditorTarget,
  rememberEditorSelection,
  redoEditor,
  selectAllEditor,
  undoEditor,
} from '../editor/formatting';

interface MenuItemData {
  label: string;
  shortcut?: string;
  action?: () => void;
  divider?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
}

function ContextMenu({ x, y, onClose }: ContextMenuProps) {
  const { t } = useTranslation();
  const handleMouseDown = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    rememberEditorSelection();
  }, []);
  const runAction = useCallback((action: () => void) => {
    action();
    onClose();
  }, [onClose]);

  const handleLink = useCallback(() => {
    rememberEditorSelection();
    const url = window.prompt(t('editor.enterLinkUrl'), getActiveLinkHref() ?? 'https://');
    if (url !== null) {
      applyLink(url);
    }
    onClose();
  }, [onClose, t]);

  useEffect(() => {
    const handleClick = () => onClose();
    setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => document.removeEventListener('click', handleClick);
  }, [onClose]);

  const menuItems: MenuItemData[] = [
    { label: t('menu.bold'), action: () => runAction(() => { applyInlineFormat('bold'); }) },
    { label: t('menu.italic'), action: () => runAction(() => { applyInlineFormat('italic'); }) },
    { label: t('menu.strikethrough'), action: () => runAction(() => { applyInlineFormat('strikethrough'); }) },
    { label: t('menu.inlineCode'), action: () => runAction(() => { applyInlineFormat('inline-code'); }) },
    { label: t('menu.link'), action: handleLink },
    { label: 'inline-divider', divider: true },
    { label: t('contextMenu.body'), action: () => runAction(() => { applyBlockFormat('paragraph'); }) },
    { label: t('contextMenu.heading1'), action: () => runAction(() => { applyBlockFormat('heading-1'); }) },
    { label: t('contextMenu.heading2'), action: () => runAction(() => { applyBlockFormat('heading-2'); }) },
    { label: t('contextMenu.heading3'), action: () => runAction(() => { applyBlockFormat('heading-3'); }) },
    { label: t('contextMenu.heading4'), action: () => runAction(() => { applyBlockFormat('heading-4'); }) },
    { label: t('contextMenu.heading5'), action: () => runAction(() => { applyBlockFormat('heading-5'); }) },
    { label: t('contextMenu.heading6'), action: () => runAction(() => { applyBlockFormat('heading-6'); }) },
    { label: 'block-divider', divider: true },
    { label: t('menu.quote'), action: () => runAction(() => { applyBlockFormat('blockquote'); }) },
    { label: t('menu.orderedList'), action: () => runAction(() => { applyBlockFormat('ordered-list'); }) },
    { label: t('menu.unorderedList'), action: () => runAction(() => { applyBlockFormat('bullet-list'); }) },
    { label: t('slashMenu.codeBlock'), action: () => runAction(() => { applyBlockFormat('code-block'); }) },
  ];

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        background: 'var(--color-paper)',
        border: '1px solid var(--color-line-soft)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: '4px 0',
        minWidth: '120px',
        zIndex: 3000,
      }}
    >
      {menuItems.map((item, index) =>
        item.divider ? (
          <div
            key={`divider-${index}`}
            style={{
              height: '1px',
              background: 'var(--color-line-soft)',
              margin: '4px 0',
            }}
          />
        ) : (
          <div
            key={`${item.label}-${index}`}
            onClick={item.action}
            onMouseDown={handleMouseDown}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              cursor: 'pointer',
              color: 'var(--color-ink)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-sunken)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {item.label}
          </div>
        )
      )}
    </div>
  );
}

export function MenuBar() {
  const { t } = useTranslation();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const activeMenuRef = useRef<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  const currentFile = useEditorStore((state) => state.currentFile);
  const updateFilePath = useEditorStore((state) => state.updateFilePath);
  const { workspaceRoot, setFileTree, addWorkspaceRoot } = useWorkspaceStore();
  const {
    toggleSidebar,
    toggleOutline,
    setSidebarVisible,
    setSidebarTab,
    toggleTheme,
    toggleLanguage,
    language,
    theme,
    fontSize,
    setFontSize,
    setSettingsOpen,
    setSettingsActiveTab,
    exportSettings,
    terminalVisible,
  } = useUIStore();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        activeMenuRef.current = null;
        setMenusOpen({});
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [menusOpen, setMenusOpen] = useState<Record<string, boolean>>({});

  const getSaveFileName = (filePath: string) =>
    filePath.split(/[\\/]/).pop() || `${t('fileTree.untitled')}.md`;

  const selectSavePath = async (filePath: string) =>
    window.electronAPI.showSaveDialog({
      defaultPath: getSaveFileName(filePath),
      filters: [{ name: t('common.markdown'), extensions: ['md'] }],
    });

  const persistFile = async (sourcePath: string, targetPath: string) => {
    const editorState = useEditorStore.getState();
    const content = editorState.getFileContent(sourcePath);
    const wasDraft = editorState.isDraftFile(sourcePath);
    await window.electronAPI.writeFile(targetPath, content);

    if (wasDraft || sourcePath !== targetPath) {
      updateFilePath(sourcePath, targetPath);
    }

    if (wasDraft && sourcePath !== targetPath) {
      await window.electronAPI.deletePath(sourcePath);
    }

    useEditorStore.getState().setLoadedContent(content, targetPath);

    if (workspaceRoot) {
      const entries = await window.electronAPI.listDir(workspaceRoot);
      setFileTree(entries);
    }
  };

  const handleOpenFile = async () => {
    try {
      const selected = await window.electronAPI.pickFile({
        filters: [
          { name: t('common.markdown'), extensions: ['md', 'markdown'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (selected) {
        useEditorStore.getState().addOpenFile(selected);
      }
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  };

  const handleOpenFolder = async () => {
    try {
      const selected = await window.electronAPI.pickFolder();
      if (selected) {
        addWorkspaceRoot(selected);
        try {
          const entries = await window.electronAPI.listDir(selected);
          useWorkspaceStore.getState().setRootFileTree(selected, entries);
        } catch (err) {
          console.error('Failed to load folder:', err);
        }
        setSidebarVisible(true);
        setSidebarTab('files');
      }
    } catch (err) {
      console.error('Failed to pick folder:', err);
    }
  };

  const handleNewFile = async () => {
    if (workspaceRoot) {
      const baseName = t('fileTree.untitled') || 'Untitled';
      let fileName = baseName + '.md';
      let counter = 1;
      while (true) {
        try {
          const testPath = `${workspaceRoot}/${fileName}`;
          await window.electronAPI.readFile(testPath);
          counter++;
          fileName = `${baseName}-${counter}.md`;
        } catch {
          break;
        }
      }
      const newPath = `${workspaceRoot}/${fileName}`;
      try {
        await window.electronAPI.createFile(newPath);
        useEditorStore.getState().addOpenFile(newPath, { isDraft: true });
        const entries = await window.electronAPI.listDir(workspaceRoot);
        setFileTree(entries);
      } catch (err) {
        console.error('Failed to create file:', err);
      }
    }
  };

  const handleSave = async () => {
    if (!currentFile) return;
    try {
      if (useEditorStore.getState().isDraftFile(currentFile)) {
        const selected = await selectSavePath(currentFile);
        if (selected) {
          await persistFile(currentFile, selected);
        }
      } else {
        await persistFile(currentFile, currentFile);
      }
    } catch (err) {
      console.error('Failed to save:', err);
    }
  };

  const handleSaveAs = async () => {
    if (!currentFile) return;
    const selected = await selectSavePath(currentFile);
    if (selected) {
      await persistFile(currentFile, selected);
    }
  };

  const buildExportPayload = (type: 'pdf' | 'html') => {
    const editorRoot = document.querySelector('.ProseMirror');
    if (!(editorRoot instanceof HTMLElement)) {
      return null;
    }

    const clone = editorRoot.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.copy-btn').forEach((node) => node.remove());

    return {
      type,
      title: getSaveFileName(currentFile || t('menu.exportDefaultName')),
      html: clone.innerHTML,
      currentFilePath: currentFile,
      theme,
      pdf: {
        pageSize: exportSettings.pdfPageSize,
        margin: exportSettings.pdfMargin,
        printBackground: exportSettings.pdfPrintBackground,
        displayHeaderFooter: exportSettings.pdfHeaderFooter,
      },
      htmlOptions: {
        imageMode: exportSettings.htmlImageMode,
      },
    };
  };

  const handleExport = async (type: 'pdf' | 'html') => {
    const payload = buildExportPayload(type);
    if (!payload) return;

    try {
      await window.electronAPI.exportDocument(payload);
    } catch (error) {
      console.error(`Failed to export ${type}:`, error);
    }
  };

  const handleFindInFile = () => {
    useSearchStore.getState().searchFileOpen(true);
  };

  const handleFindInWorkspace = () => {
    setSidebarVisible(true);
    setSidebarTab('search');
  };

  const handleFormatBlock = (tag: string) => {
    const formatMap: Record<string, Parameters<typeof applyBlockFormat>[0]> = {
      p: 'paragraph',
      h1: 'heading-1',
      h2: 'heading-2',
      h3: 'heading-3',
      h4: 'heading-4',
      h5: 'heading-5',
      h6: 'heading-6',
    };

    const format = formatMap[tag];
    if (format) {
      applyBlockFormat(format);
    }
  };

  const handleList = (type: 'ordered' | 'unordered') => {
    applyBlockFormat(type === 'ordered' ? 'ordered-list' : 'bullet-list');
  };

  const handleBlockquote = () => { applyBlockFormat('blockquote'); };

  const handleBold = () => { applyInlineFormat('bold'); };
  const handleItalic = () => { applyInlineFormat('italic'); };
  const handleStrikethrough = () => { applyInlineFormat('strikethrough'); };
  const handleCode = () => { applyInlineFormat('inline-code'); };
  const handleLink = () => {
    rememberEditorSelection();
    const url = window.prompt(t('editor.enterLinkUrl'), getActiveLinkHref() ?? 'https://');
    if (url !== null) {
      applyLink(url);
    }
  };
  const handleUndo = () => { undoEditor(); };
  const handleRedo = () => { redoEditor(); };
  const handleSelectAll = () => { selectAllEditor(); };

  const handleIncreaseFontSize = () => setFontSize(fontSize + 1);
  const handleDecreaseFontSize = () => setFontSize(fontSize - 1);

  const menus: Record<string, MenuItemData[]> = {
    [t('menu.file')]: [
      { label: t('menu.newFile'), shortcut: 'Ctrl+N', action: handleNewFile },
      { label: t('menu.openFile'), shortcut: 'Ctrl+O', action: handleOpenFile },
      { label: t('menu.openFolder'), shortcut: 'Ctrl+Shift+O', action: handleOpenFolder },
      { divider: true, label: '' },
      { label: t('menu.save'), shortcut: 'Ctrl+S', action: handleSave },
      { label: t('menu.saveAs'), action: handleSaveAs },
      { divider: true, label: '' },
      { label: t('menu.exportPdf'), action: () => void handleExport('pdf') },
      { label: t('menu.exportHtml'), action: () => void handleExport('html') },
      { divider: true, label: '' },
      { label: t('menu.exit'), action: () => window.close() },
    ],
    [t('menu.edit')]: [
      { label: t('menu.undo'), shortcut: 'Ctrl+Z', action: handleUndo },
      { label: t('menu.redo'), shortcut: 'Ctrl+Shift+Z', action: handleRedo },
      { label: t('menu.find'), shortcut: 'Ctrl+F', action: handleFindInFile },
      { label: t('menu.findInWorkspace'), shortcut: 'Ctrl+Shift+F', action: handleFindInWorkspace },
      { divider: true, label: '' },
      { label: t('menu.selectAll'), shortcut: 'Ctrl+A', action: handleSelectAll },
      { divider: true, label: '' },
      { label: t('menu.shortcuts'), action: () => { setSettingsActiveTab('shortcuts'); setSettingsOpen(true); } },
    ],
    [t('menu.paragraph')]: [
      { label: t('menu.heading1'), shortcut: 'Ctrl+1', action: () => handleFormatBlock('h1') },
      { label: t('menu.heading2'), shortcut: 'Ctrl+2', action: () => handleFormatBlock('h2') },
      { label: t('menu.heading3'), shortcut: 'Ctrl+3', action: () => handleFormatBlock('h3') },
      { label: t('menu.body'), shortcut: 'Ctrl+0', action: () => handleFormatBlock('p') },
      { divider: true, label: '' },
      { label: t('menu.orderedList'), action: () => handleList('ordered') },
      { label: t('menu.unorderedList'), action: () => handleList('unordered') },
      { label: t('menu.quote'), action: handleBlockquote },
    ],
    [t('menu.format')]: [
      { label: t('menu.bold'), shortcut: 'Ctrl+B', action: handleBold },
      { label: t('menu.italic'), shortcut: 'Ctrl+I', action: handleItalic },
      { label: t('menu.strikethrough'), shortcut: 'Ctrl+Shift+S', action: handleStrikethrough },
      { label: t('menu.inlineCode'), action: handleCode },
      { divider: true, label: '' },
      { label: t('menu.link'), shortcut: 'Ctrl+K', action: handleLink },
    ],
    [t('menu.view')]: [
      { label: t('menu.sidebar'), shortcut: 'Ctrl+\\', action: toggleSidebar },
      { label: t('menu.outline'), shortcut: 'Ctrl+Shift+\\', action: toggleOutline },
      { label: t('menu.terminal'), shortcut: 'Ctrl+`', action: () => { void toggleTerminalPanel(); } },
      { label: t('menu.newTerminal'), shortcut: 'Ctrl+Shift+`', action: () => { void openNewTerminalTab(); } },
      { divider: true, label: '' },
      { label: t('menu.zoomIn'), action: handleIncreaseFontSize },
      { label: t('menu.zoomOut'), action: handleDecreaseFontSize },
      { label: `${t('menu.currentFontSize')}: ${fontSize}`, action: () => {} },
      { divider: true, label: '' },
      { label: theme === 'light' ? t('menu.darkMode') : t('menu.lightMode'), shortcut: 'Ctrl+Shift+D', action: toggleTheme },
    ],
    [t('menu.settings')]: [
      { label: t('menu.settings'), shortcut: 'Ctrl+,', action: () => { setSettingsOpen(true); } },
      { label: t('menu.exportSettings'), action: () => { setSettingsActiveTab('export'); setSettingsOpen(true); } },
    ],
  };

  const toggleMenu = (label: string) => {
    setMenusOpen((prev) => ({ ...prev, [label]: !prev[label] }));
    activeMenuRef.current = activeMenuRef.current === label ? null : label;
  };

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      if (!isEditorTarget(e.target) || !hasEditorSelection()) return;
      e.preventDefault();
      rememberEditorSelection();
      setContextMenu({ x: e.clientX, y: e.clientY });
    };
    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  const runMenuAction = async (action: NativeMenuAction) => {
    switch (action) {
      case 'new-file':
        await handleNewFile();
        break;
      case 'open-file':
        await handleOpenFile();
        break;
      case 'open-folder':
        await handleOpenFolder();
        break;
      case 'save':
        await handleSave();
        break;
      case 'save-as':
        await handleSaveAs();
        break;
      case 'export-pdf':
        await handleExport('pdf');
        break;
      case 'export-html':
        await handleExport('html');
        break;
      case 'undo':
        handleUndo();
        break;
      case 'redo':
        handleRedo();
        break;
      case 'find-in-file':
        handleFindInFile();
        break;
      case 'find-in-workspace':
        handleFindInWorkspace();
        break;
      case 'select-all':
        handleSelectAll();
        break;
      case 'heading-1':
        handleFormatBlock('h1');
        break;
      case 'heading-2':
        handleFormatBlock('h2');
        break;
      case 'heading-3':
        handleFormatBlock('h3');
        break;
      case 'body':
        handleFormatBlock('p');
        break;
      case 'ordered-list':
        handleList('ordered');
        break;
      case 'unordered-list':
        handleList('unordered');
        break;
      case 'blockquote':
        handleBlockquote();
        break;
      case 'bold':
        handleBold();
        break;
      case 'italic':
        handleItalic();
        break;
      case 'strikethrough':
        handleStrikethrough();
        break;
      case 'inline-code':
        handleCode();
        break;
      case 'link':
        handleLink();
        break;
      case 'toggle-sidebar':
        toggleSidebar();
        break;
      case 'toggle-outline':
        toggleOutline();
        break;
      case 'toggle-terminal':
        await toggleTerminalPanel();
        break;
      case 'new-terminal':
        await openNewTerminalTab();
        break;
      case 'zoom-in':
        handleIncreaseFontSize();
        break;
      case 'zoom-out':
        handleDecreaseFontSize();
        break;
      case 'toggle-theme':
        toggleTheme();
        break;
      case 'open-settings':
        setSettingsOpen(true);
        break;
      case 'open-export-settings':
        setSettingsActiveTab('export');
        setSettingsOpen(true);
        break;
      case 'open-shortcuts':
        setSettingsActiveTab('shortcuts');
        setSettingsOpen(true);
        break;
      case 'toggle-language':
        toggleLanguage();
        break;
    }
  };

  useEffect(() => {
    const cleanup = window.electronAPI.onMenuAction((action) => {
      void runMenuAction(action);
    });

    return () => cleanup();
  }, [runMenuAction]);

  return (
    <>
      <div
        ref={menuBarRef}
        style={{
          height: '28px',
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          background: 'var(--color-paper)',
          borderBottom: '1px solid var(--color-line-soft)',
          gap: '0px',
          userSelect: 'none',
        }}
      >
        {Object.entries(menus).map(([label, items]) => (
          <div key={label} style={{ position: 'relative' }}>
            <button
              onClick={() => toggleMenu(label)}
              onMouseEnter={() => {
                if (activeMenuRef.current && activeMenuRef.current !== label) {
                  setMenusOpen({ [label]: true });
                }
              }}
              style={{
                padding: '4px 12px',
                fontSize: '13px',
                color: menusOpen[label] ? 'var(--color-ink)' : 'var(--color-ink)',
                background: menusOpen[label] ? 'var(--color-surface-sunken)' : 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                height: '24px',
              }}
            >
              {label}
            </button>
            {menusOpen[label] && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '2px',
                  background: 'var(--color-paper)',
                  border: '1px solid var(--color-line-soft)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  padding: '4px 0',
                  minWidth: '180px',
                  zIndex: 2000,
                }}
              >
                {items.map((item, index) => {
                  if (item.divider) {
                    return (
                      <div
                        key={index}
                        style={{
                          height: '1px',
                          background: 'var(--color-line-soft)',
                          margin: '4px 8px',
                        }}
                      />
                    );
                  }
                  return (
                    <div
                      key={item.label}
                      onClick={() => {
                        if (item.action) item.action();
                        setMenusOpen({});
                        activeMenuRef.current = null;
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: item.label.startsWith(t('menu.currentFontSize')) ? 'var(--color-muted)' : 'var(--color-ink)',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-sunken)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && (
                        <span style={{ color: 'var(--color-muted)', fontSize: '12px', marginLeft: '24px' }}>
                          {item.shortcut}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {/* Top-level Terminal entry — single button, sits alongside File/Edit/etc. */}
        <button
          onClick={() => {
            void toggleTerminalPanel();
          }}
          title={t('menu.terminal')}
          style={{
            padding: '4px 12px',
            fontSize: '13px',
            color: 'var(--color-ink)',
            background: terminalVisible ? 'var(--color-surface-sunken)' : 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            height: '24px',
          }}
        >
          {t('menu.terminal')}
        </button>

        {/* Language toggle button */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 8px' }}>
          <button
            onClick={toggleLanguage}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              color: 'var(--color-ink)',
              background: 'transparent',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              height: '24px',
            }}
            title={t('menu.toggleLanguage')}
          >
            {language === 'zh' ? 'EN' : '中'}
          </button>
        </div>
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
