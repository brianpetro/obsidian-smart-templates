/**
 * Append the latest commit message to COMMIT_LOG.md
 * Implemented as functional, dependency‑free ESM.
 * @module post_commit
 */

import {execSync} from 'node:child_process';
import {appendFileSync, existsSync, writeFileSync} from 'node:fs';
import path from 'node:path';

/** Return the full message body of the most recent commit. */
export const get_last_commit_message = () =>
  execSync('git log -1 --pretty=%B', {encoding: 'utf8'}).trim();

/** Wrap the message with an ISO‑8601 timestamp header. */
export const format_record = msg =>
  `## ${new Date().toISOString()}\n${msg}\n\n`;


/** Append the record and stage the file for the next commit. */
export const append_and_stage = (path, record) => {
  appendFileSync(path, record);
  execSync(`git add "${path}"`);
};

/** Entry point for the hook. */
export const run = () => {
  console.log('Running post-commit hook…');
  const log_path = path.join(process.cwd(), 'releases', '1.1.0.md');
  // Get the list of files changed in the last commit
  const changed_files = execSync('git diff-tree --no-commit-id --name-only -r HEAD', {encoding: 'utf8'})
    .split('\n')
    .filter(Boolean);
  // Skip if only the log_path was changed
  if (changed_files.length === 1 && changed_files[0] === log_path) return;
  append_and_stage(log_path, get_last_commit_message());
};

if (import.meta.url === `file://${process.argv[1]}`) run();
