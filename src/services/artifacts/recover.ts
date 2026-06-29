export type RecoveredArtifact = {
  content: string;
  kind: 'html' | 'markdown' | 'text';
  partial: boolean;
  error?: string;
};

function stripFence(raw: string, lang: string): string | null {
  const regex = new RegExp(`^\\s*\`\`\`${lang}\\s*\\n([\\s\\S]*?)\\n\`\`\`\\s*$`, 'iu');
  return raw.match(regex)?.[1] ?? null;
}

export function recoverArtifactOutput(raw: string): RecoveredArtifact {
  const htmlFence = stripFence(raw, 'html?');
  const candidate = htmlFence ?? raw.trim();
  if (/<!doctype\s+html\b|<html\b/iu.test(candidate)) {
    return { content: candidate, kind: 'html', partial: !/<\/html>\s*$/iu.test(candidate) };
  }
  if (/<[a-z][\s\S]*>/iu.test(candidate) && !candidate.startsWith('#')) {
    return { content: candidate, kind: 'html', partial: false };
  }
  const markdownFence = stripFence(raw, 'markdown|md');
  if (markdownFence) return { content: markdownFence, kind: 'markdown', partial: false };
  return { content: raw, kind: 'markdown', partial: false };
}
