import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Outline } from '../src/components/Outline';
import { useEditorStore } from '../src/store/editor';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    initReactI18next: {
      type: '3rdParty',
      init: () => {},
    },
    useTranslation: () => ({
      t: (key: string) => {
        const dictionary: Record<string, string> = {
          'outline.title': 'Outline',
          'outline.empty': 'No headings',
        };

        return dictionary[key] ?? key;
      },
    }),
  };
});

describe('Outline', () => {
  beforeEach(() => {
    useEditorStore.setState({
      currentFile: 'C:\\workspace\\notes.md',
      content: '# Title\n\nText\n\n## Subtitle\n\n```md\n# hidden\n```\n\nSetext\n---',
      isDirty: false,
      saveStatus: 'saved',
      openFiles: [],
    });
  });

  afterEach(() => {
    cleanup();
    useEditorStore.getState().reset();
  });

  it('renders headings directly from markdown content', () => {
    render(<Outline />);

    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Subtitle')).toBeInTheDocument();
    expect(screen.getByText('Setext')).toBeInTheDocument();
    expect(screen.queryByText('hidden')).not.toBeInTheDocument();
  });

  it('scrolls to the matching editor heading when an outline item is clicked', () => {
    const scrollIntoView = vi.fn();
    const editorRoot = document.createElement('div');
    editorRoot.className = 'ProseMirror';
    editorRoot.innerHTML = '<h1>Title</h1><h2>Subtitle</h2><h2>Setext</h2>';
    document.body.appendChild(editorRoot);
    editorRoot.querySelectorAll('h1, h2').forEach((heading) => {
      (heading as HTMLElement).scrollIntoView = scrollIntoView;
    });

    const { container } = render(<Outline />);
    const outlineItems = container.querySelectorAll('div[style*="cursor: pointer"]');

    fireEvent.click(outlineItems[1] as HTMLElement);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    document.body.removeChild(editorRoot);
  });
});
