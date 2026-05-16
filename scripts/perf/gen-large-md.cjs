// Generate a ~1MB markdown file for perf testing.
const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, '..', '..', 'tasks', 'sample-1mb.md');
const block = `## Section Heading

Lorem ipsum dolor sit amet, consectetur adipiscing elit. **Bold text** and *italic text*
mixed with \`inline code\` and [a link](https://example.com).

- list item one
- list item two with **emphasis**
- list item three

> A blockquote line that wraps across enough characters to feel like prose
> in a real document and exercise the renderer's text-flow path.

\`\`\`ts
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

| Column A | Column B | Column C |
| -------- | -------- | -------- |
| value 1  | value 2  | value 3  |
| value 4  | value 5  | value 6  |

`;

const target = 1024 * 1024; // 1 MiB
let buf = '';
let i = 0;
while (Buffer.byteLength(buf, 'utf8') < target) {
  buf += `# Chapter ${++i}\n\n` + block;
}
fs.writeFileSync(out, buf, 'utf8');
console.log(`wrote ${out} (${(Buffer.byteLength(buf, 'utf8') / 1024).toFixed(1)} KiB)`);
