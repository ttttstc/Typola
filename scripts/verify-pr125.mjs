import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const npmCmd = 'npm';
const gitCmd = 'git';

function run(command, args, options = {}) {
  const commandLine = [command, ...args]
    .map((part) => {
      const value = String(part);
      return /[\s&()^|<>"]/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
    })
    .join(' ');
  const result = process.platform === 'win32'
    ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', commandLine], {
      encoding: 'utf8',
      shell: false,
      ...options,
    })
    : spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
    ...options,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (options.print !== false) {
    process.stdout.write(output);
  }
  if (result.status !== 0) {
    if (result.error) {
      throw result.error;
    }
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
  return output;
}

function gitNames(args) {
  const result = spawnSync(gitCmd, args, { encoding: 'utf8', shell: false });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed:\n${result.stderr}`);
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim().replaceAll('\\', '/'))
    .filter(Boolean);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const tooltipPath = 'src/components/ui/Tooltip.tsx';
const toolbarPath = 'src/components/Toolbar.tsx';
const touchedFiles = new Set([
  ...gitNames(['show', 'HEAD', '--name-only', '--pretty=format:']),
  ...gitNames(['diff', '--name-only', 'HEAD']),
  ...gitNames(['ls-files', '--others', '--exclude-standard']),
]);

assert(existsSync(tooltipPath), `${tooltipPath} is missing`);
assert(
  touchedFiles.has(tooltipPath),
  `${tooltipPath} is not present in HEAD, diff, or untracked files`,
);

const toolbarContent = run(gitCmd, ['show', `HEAD:${toolbarPath}`], { print: false });
assert(
  toolbarContent.includes("from './ui/Tooltip'") || toolbarContent.includes('from "./ui/Tooltip"'),
  `${toolbarPath} does not import ./ui/Tooltip in HEAD`,
);

console.log('\n[verify-pr125] Running typecheck...');
run(npmCmd, ['run', 'typecheck']);

console.log('\n[verify-pr125] Running vitest...');
const testOutput = run(npmCmd, ['test']);
const passedMatch = testOutput.match(/Tests\s+(\d+)\s+passed/i);
assert(passedMatch, 'Could not parse vitest passed test count');
const passedCount = Number(passedMatch[1]);
assert(passedCount >= 593, `Expected at least 593 tests, got ${passedCount}`);

console.log(`\n[verify-pr125] OK: Tooltip is present, typecheck passed, ${passedCount} tests passed.`);
