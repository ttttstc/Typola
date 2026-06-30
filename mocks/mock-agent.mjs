#!/usr/bin/env node

const provider = process.env.TYPOLA_MOCK_AGENT || 'agent';
const args = process.argv.slice(2);

if (args.includes('--version') || args.includes('version')) {
  console.log(`${provider} mock 0.0.0`);
  process.exit(0);
}

console.log(JSON.stringify({
  type: 'message',
  role: 'assistant',
  content: `${provider} mock is detection-only in Typola Phase 3.`,
}));
