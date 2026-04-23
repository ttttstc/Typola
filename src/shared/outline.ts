export interface OutlineHeading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
}

function normalizeHeadingText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function stripClosingHashes(value: string) {
  return value.replace(/\s+#+\s*$/, '');
}

export function extractOutlineHeadings(markdown: string): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  const lines = markdown.split(/\r?\n/);
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();

    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      continue;
    }

    const atxMatch = rawLine.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (atxMatch) {
      const text = normalizeHeadingText(stripClosingHashes(atxMatch[2]));
      if (text) {
        headings.push({
          level: atxMatch[1].length as OutlineHeading['level'],
          text,
        });
      }
      continue;
    }

    if (index + 1 >= lines.length || !trimmed) {
      continue;
    }

    const underline = lines[index + 1].trim();
    if (/^=+\s*$/.test(underline) || /^-+\s*$/.test(underline)) {
      headings.push({
        level: /^=+\s*$/.test(underline) ? 1 : 2,
        text: normalizeHeadingText(trimmed),
      });
      index += 1;
    }
  }

  return headings;
}
