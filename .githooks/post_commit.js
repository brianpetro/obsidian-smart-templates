import { execSync } from 'node:child_process';
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const logPath  = join(repoRoot, 'releases', '1.1.0.md')
                 .replaceAll(sep, '/');           // "C:\..." -> "C:/..."

export const run = () => {
  console.log('Running post-commit hook…');

  // Skip if the commit only touched the log itself
  const changed = execSync('git diff-tree --no-commit-id --name-only -r HEAD', { encoding: 'utf8' })
                    .trim().split('\n')
                    .filter(Boolean)
                    .map(p => p.replaceAll('\\', '/'));     // normalise

  if (changed.length === 1 && changed[0] === relative(repoRoot, logPath)) return;

  if (!existsSync(logPath)) writeFileSync(logPath, '# Release log\n\n');
  appendFileSync(logPath, `## ${new Date().toISOString()}\n${getCommitMsg()}\n\n`);
  execSync(`git add "${logPath}"`);
};
