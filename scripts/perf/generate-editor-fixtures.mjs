#!/usr/bin/env node
// Generate perf fixtures for v0.7 Sprint 0.
// Run from repo root: `node scripts/perf/generate-editor-fixtures.mjs`
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'fixtures/perf';
fs.mkdirSync(OUT, { recursive: true });

// 1. cm6-markdown-5k.md — 5K chars of varied markdown to exercise
// CM6 input + decoration pipeline. Mixed inline + block elements.
{
  const parts = ['# Markdown 5K Fixture\n\n'];
  let i = 0;
  while (parts.join('').length < 5000) {
    i++;
    parts.push(`## Section ${i}\n\n`);
    parts.push(`This is paragraph ${i} of the 5K fixture. It mixes `);
    parts.push(`*italic*, **bold**, and \`inline code\`. `);
    parts.push(`[Link ${i}](https://example.com/p${i}) and a `);
    parts.push(`![image ${i}](https://example.com/img${i}.png).\n\n`);
    if (i % 3 === 0) {
      parts.push(`- item ${i}.a\n- item ${i}.b\n- item ${i}.c\n\n`);
    }
    if (i % 5 === 0) {
      parts.push('```ts\nconst value_' + i + ' = ' + (i * 7) + ';\nconsole.log(value_' + i + ');\n```\n\n');
    }
    if (i % 7 === 0) {
      parts.push(`> Blockquote ${i}: Latin text *${i}* used as filler.\n\n`);
    }
  }
  fs.writeFileSync(path.join(OUT, 'cm6-markdown-5k.md'), parts.join(''));
}

// 2. cm6-markdown-10k-100-headings.md — 100 H2 headings with
// 1-2 paragraphs each, total ~10K. Targets heading-fold + outline.
{
  const parts = [];
  for (let i = 1; i <= 100; i++) {
    parts.push(`## Heading ${i}\n\n`);
    parts.push(`Paragraph for heading ${i}. `);
    parts.push(`Sed ut perspiciatis unde omnis iste natus error sit voluptatem `);
    parts.push(`accusantium doloremque laudantium, totam rem aperiam, eaque ipsa `);
    parts.push(`quae ab illo inventore veritatis et quasi architecto beatae ${i}.\n\n`);
  }
  fs.writeFileSync(path.join(OUT, 'cm6-markdown-10k-100-headings.md'), parts.join(''));
}

// 3. cm6-mermaid-5-graphs.md — 5 small mermaid graphs of different
// diagram types. Targets mermaid renderer concurrency (issue #132 §4.2.3).
{
  const md = `# Mermaid 5 Graphs

\`\`\`mermaid
flowchart LR
  A[Start] --> B{Decision}
  B -->|Yes| C[Process]
  B -->|No| D[Skip]
  C --> E[End]
  D --> E
\`\`\`

\`\`\`mermaid
sequenceDiagram
  participant U as User
  participant S as Server
  U->>S: Request
  S-->>U: Response
\`\`\`

\`\`\`mermaid
classDiagram
  class Animal {
    +name: string
    +age: int
  }
  class Dog {
    +bark()
  }
  Animal <|-- Dog
\`\`\`

\`\`\`mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Working: start
  Working --> Idle: stop
  Working --> [*]: cancel
\`\`\`

\`\`\`mermaid
gantt
  title Project Plan
  dateFormat YYYY-MM-DD
  section Phase 1
  Task 1: t1, 2026-01-01, 5d
  Task 2: t2, after t1, 3d
  section Phase 2
  Task 3: t3, after t2, 4d
\`\`\`
`;
  fs.writeFileSync(path.join(OUT, 'cm6-mermaid-5-graphs.md'), md);
}

// 4. cm6-word-preview-100-pages.md — 100 H1 sections with subsections,
// targeting Word preview pagination. Section density is tuned so the
// paginated output approaches 100 A4 pages at default font size.
{
  const parts = [];
  for (let i = 1; i <= 100; i++) {
    parts.push(`# Page ${i}\n\n`);
    parts.push(`Content for page ${i}. Word preview rendering paginates this `);
    parts.push(`into distinct page sections. Each page should consume roughly `);
    parts.push(`one A4 page worth of content at default settings.\n\n`);
    parts.push(`## Subsection ${i}.1\n\nSome subsection content with **bold** and *italic* formatting, plus \`inline code\`.\n\n`);
    parts.push(`## Subsection ${i}.2\n\nMore content with a list:\n\n- Point ${i}.1\n- Point ${i}.2\n- Point ${i}.3\n- Point ${i}.4\n- Point ${i}.5\n\n`);
    parts.push(`A short paragraph closes page ${i}, ensuring the next H1 starts a fresh page in Word preview output.\n\n`);
  }
  fs.writeFileSync(path.join(OUT, 'cm6-word-preview-100-pages.md'), parts.join(''));
}

// 5. ai-100-messages.json — 100 alternating user/assistant messages
// for AI conversation streaming perf measurement.
{
  const messages = [];
  for (let i = 1; i <= 100; i++) {
    const role = i % 2 === 1 ? 'user' : 'assistant';
    messages.push({
      id: `msg-${String(i).padStart(3, '0')}`,
      role,
      content: `Message ${i} in the 100-message AI conversation fixture. ` +
        (role === 'user'
          ? `This is a user query asking about topic ${i} with some context.`
          : `This is an assistant response explaining topic ${i} in moderate detail.`),
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    });
  }
  fs.writeFileSync(path.join(OUT, 'ai-100-messages.json'), JSON.stringify(messages, null, 2) + '\n');
}

console.log(`Generated 5 fixtures in ${OUT}/`);
for (const f of fs.readdirSync(OUT)) {
  const stat = fs.statSync(path.join(OUT, f));
  console.log(`  ${f.padEnd(40)} ${stat.size} bytes`);
}
