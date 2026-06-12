export function createLinkMarkdown(label = '链接文字', url = 'https://'): string {
  return `[${label || '链接文字'}](${url || 'https://'})`;
}

export function createImageMarkdown(alt = '图片描述', path = './assets/image.png'): string {
  return `![${alt || '图片描述'}](${path || './assets/image.png'})`;
}

export function createTableMarkdown(rows = 3, columns = 3): string {
  const safeRows = Math.min(12, Math.max(2, Math.round(rows)));
  const safeColumns = Math.min(8, Math.max(2, Math.round(columns)));
  const header = Array.from({ length: safeColumns }, (_, index) => `列 ${index + 1}`);
  const separator = Array.from({ length: safeColumns }, () => '---');
  const body = Array.from({ length: safeRows - 1 }, () => Array.from({ length: safeColumns }, () => ' '));
  return [header, separator, ...body]
    .map((row) => `| ${row.join(' | ')} |`)
    .join('\n');
}

export function appendMarkdownBlock(source: string, block: string): string {
  const prefix = source.trimEnd();
  return prefix ? `${prefix}\n\n${block}\n` : `${block}\n`;
}

export function attachmentMarkdownPath(fileName: string): string {
  return `./assets/${fileName}`;
}
