import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorStore } from '../store/editor';
import { useSearchStore } from '../store/search';
import { useWorkspaceStore } from '../store/workspace';
import { useUIStore } from '../store/ui';
import { useAIStore } from '../store/ai';
import { captureSelectionSnapshot } from '../ai/selection';
import type { AIRightClickAction } from '../llm/types';

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
  const aiSettings = useAIStore((state) => state.settings);
  const setPendingAction = useAIStore((state) => state.setPendingAction);
  const runAction = useAIStore((state) => state.runAction);
  const setSettingsOpen = useUIStore((state) => state.setSettingsOpen);
  const setSettingsActiveTab = useUIStore((state) => state.setSettingsActiveTab);

  const handleAIAction = useCallback(
    async (action: AIRightClickAction) => {
      const snapshot = captureSelectionSnapshot();
      if (!snapshot) {
        onClose();
        return;
      }

      if (!aiSettings.configured || !aiSettings.hasApiKey) {
        setPendingAction({
          action,
          selection: snapshot,
        });
        setSettingsActiveTab('ai');
        setSettingsOpen(true);
        onClose();
        return;
      }

      await runAction(action, snapshot);
      onClose();
    },
    [aiSettings.configured, aiSettings.hasApiKey, onClose, runAction, setPendingAction, setSettingsActiveTab, setSettingsOpen]
  );

  const setHeading = useCallback((level: string) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      onClose();
      return;
    }

    if (selection.isCollapsed) {
      const editor = document.querySelector('.ProseMirror');
      if (!editor) {
        onClose();
        return;
      }

      let node: Node | null = selection.anchorNode;
      while (node && node !== editor) {
        if (node instanceof Element && (node.tagName === 'P' || /^H[1-6]$/.test(node.tagName))) {
          break;
        }
        node = node.parentNode;
      }

      if (node && node !== editor) {
        const block = node as HTMLElement;
        if (level === 'p') {
          if (/^H[1-6]$/.test(block.tagName)) {
            const text = block.textContent || '';
            const p = document.createElement('p');
            p.textContent = text;
            block.parentNode?.replaceChild(p, block);
          }
        } else {
          const tagName = level.toUpperCase();
          if (block.tagName !== tagName) {
            const text = block.textContent || '';
            const heading = document.createElement(tagName);
            heading.textContent = text;
            block.parentNode?.replaceChild(heading, block);
          }
        }
      }
    } else {
      const range = selection.getRangeAt(0);
      const selectedText = selection.toString().trim();
      if (!selectedText) {
        onClose();
        return;
      }

      const heading = document.createElement(level.toUpperCase());
      heading.textContent = selectedText;

      range.deleteContents();
      range.insertNode(heading);

      const newRange = document.createRange();
      newRange.setStartAfter(heading);
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);

      const editor = document.querySelector('.ProseMirror');
      if (editor) {
        const event = new Event('input', { bubbles: true });
        editor.dispatchEvent(event);
      }
    }

    onClose();
  }, [onClose]);

  useEffect(() => {
    const handleClick = () => onClose();
    setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => document.removeEventListener('click', handleClick);
  }, [onClose]);

  const menuItems = [
    { label: t('aiContext.explain'), action: () => void handleAIAction('explain') },
    { label: t('aiContext.rewrite'), action: () => void handleAIAction('rewrite') },
    { label: t('aiContext.summarize'), action: () => void handleAIAction('summarize') },
    { label: t('aiContext.translate'), action: () => void handleAIAction('translate') },
    { divider: true, label: 'ai-divider' },
    { label: t('contextMenu.body'), action: () => setHeading('p') },
    { label: t('contextMenu.heading1'), action: () => setHeading('h1') },
    { label: t('contextMenu.heading2'), action: () => setHeading('h2') },
    { label: t('contextMenu.heading3'), action: () => setHeading('h3') },
    { label: t('contextMenu.heading4'), action: () => setHeading('h4') },
    { label: t('contextMenu.heading5'), action: () => setHeading('h5') },
    { label: t('contextMenu.heading6'), action: () => setHeading('h6') },
  ];

  return (
    <div
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
      {menuItems.map((item, index) => {
        if ('divider' in item && item.divider) {
          return (
            <div
              key={`${item.label}-${index}`}
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
            onClick={item.action}
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
        );
      })}
    </div>
  );
}

export function MenuBar() {
  const { t } = useTranslation();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const activeMenuRef = useRef<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  const { currentFile, content, updateFilePath, isDraftFile } = useEditorStore();
  const { workspaceRoot, setFileTree } = useWorkspaceStore();
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

  const getSaveFileName = (filePath: string) => filePath.split(/[\\/]/).pop() || 'Untitled.md';

  const selectSavePath = async (filePath: string) =>
    window.electronAPI.showSaveDialog({
      defaultPath: getSaveFileName(filePath),
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });

  const persistFile = async (sourcePath: string, targetPath: string) => {
    const wasDraft = isDraftFile(sourcePath);
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
      if (isDraftFile(currentFile)) {
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
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    let node: Node | null = selection.anchorNode;
    while (node && node !== editor) {
      if (node instanceof Element && (node.tagName === 'P' || /^H[1-6]$/.test(node.tagName))) {
        break;
      }
      node = node.parentNode;
    }

    if (!node || node === editor) return;
    const block = node as HTMLElement;

    if (tag === 'p') {
      if (/^H[1-6]$/.test(block.tagName)) {
        const text = block.textContent || '';
        const p = document.createElement('p');
        p.textContent = text;
        block.parentNode?.replaceChild(p, block);
      }
    } else {
      const tagName = tag.toUpperCase();
      if (block.tagName !== tagName) {
        const text = block.textContent || '';
        const heading = document.createElement(tagName);
        heading.textContent = text;
        block.parentNode?.replaceChild(heading, block);
      }
    }

    const event = new Event('input', { bubbles: true });
    editor.dispatchEvent(event);
  };

  const handleList = (type: 'ordered' | 'unordered') => {
    if (type === 'ordered') {
      document.execCommand('insertOrderedList');
    } else {
      document.execCommand('insertUnorderedList');
    }
  };

  const handleBlockquote = () => {
    document.execCommand('formatBlock', false, 'blockquote');
  };

  const handleBold = () => document.execCommand('bold');
  const handleItalic = () => document.execCommand('italic');
  const handleStrikethrough = () => document.execCommand('strikethrough');
  const handleCode = () => document.execCommand('code');
  const handleLink = () => {
    const url = prompt(t('editor.enterLinkUrl'));
    if (url) document.execCommand('createLink', false, url);
  };
  const handleUndo = () => document.execCommand('undo');
  const handleRedo = () => document.execCommand('redo');
  const handleSelectAll = () => document.execCommand('selectAll');

  const handleIncreaseFontSize = () => setFontSize(fontSize + 1);
  const handleDecreaseFontSize = () => setFontSize(fontSize - 1);

  const menus: Record<string, MenuItemData[]> = {
    [t('menu.file')]: [
      { label: t('menu.newFile'), shortcut: 'Ctrl+N', action: handleNewFile },
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
      { label: t('menu.inlineCode'), shortcut: 'Ctrl+`', action: handleCode },
      { divider: true, label: '' },
      { label: t('menu.link'), shortcut: 'Ctrl+K', action: handleLink },
    ],
    [t('menu.view')]: [
      { label: t('menu.sidebar'), shortcut: 'Ctrl+\\', action: toggleSidebar },
      { label: t('menu.outline'), shortcut: 'Ctrl+Shift+\\', action: toggleOutline },
      { divider: true, label: '' },
      { label: t('menu.zoomIn'), action: handleIncreaseFontSize },
      { label: t('menu.zoomOut'), action: handleDecreaseFontSize },
      { label: `${t('menu.currentFontSize')}: ${fontSize}`, action: () => {} },
      { divider: true, label: '' },
      { label: `${t('themes.' + theme)}`, shortcut: 'Ctrl+Shift+D', action: toggleTheme },
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
      const snapshot = captureSelectionSnapshot();
      if (snapshot) {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }
    };
    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, []);

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

        {/* Language toggle button */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', padding: '0 8px' }}>
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
            title="Toggle Language"
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
