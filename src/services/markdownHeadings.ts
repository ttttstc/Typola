import type { TocItem } from '../types/document';

export type MarkdownHeading = TocItem & {
  from: number;
};

const headingPattern = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const fencePattern = /^ {0,3}(`{3,}|~{3,})/;

export function collectMarkdownHeadings(content: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const lines = content.split(/(\n)/u);
  let offset = 0;
  let inFence = false;
  let fenceMarker = '';
  let idx = 0;

  for (let i = 0; i < lines.length; i += 2) {
    const line = lines[i] ?? '';
    const newline = lines[i + 1] ?? '';
    const trimmedFence = line.match(fencePattern);

    if (trimmedFence) {
      const marker = trimmedFence[1][0];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
        fenceMarker = '';
      }
      offset += line.length + newline.length;
      continue;
    }

    if (!inFence) {
      const match = line.match(headingPattern);
      if (match) {
        headings.push({
          level: match[1].length,
          text: match[2].trim(),
          id: `toc-${idx++}`,
          from: offset,
        });
      }
    }

    offset += line.length + newline.length;
  }

  return headings;
}
