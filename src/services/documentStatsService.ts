export type DocumentStats = {
  characters: number;
  words: number;
  paragraphs: number;
  readingMinutes: number;
};

function stripMarkdownSyntax(source: string): string {
  return source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|[\]()-]/g, ' ');
}

export function calculateDocumentStats(source: string): DocumentStats {
  const plain = stripMarkdownSyntax(source);
  const compact = plain.replace(/\s+/g, '');
  const cjk = plain.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? [];
  const latinWords = plain.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g) ?? [];
  const paragraphs = source
    .split(/\n\s*\n/g)
    .map((part) => part.trim())
    .filter(Boolean).length;
  const words = cjk.length + latinWords.length;

  return {
    characters: compact.length,
    words,
    paragraphs,
    readingMinutes: Math.max(1, Math.ceil(words / 350)),
  };
}
