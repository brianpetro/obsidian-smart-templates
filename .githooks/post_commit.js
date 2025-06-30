/**
 * Append the latest commit message to COMMIT_LOG.md
 * Implemented as functional, dependency‑free ESM.
 * @module post_commit
 */

import {execSync} from 'node:child_process';
import {appendFileSync, existsSync, writeFileSync, readFileSync} from 'node:fs';
import path from 'node:path';

/** Return the full message body of the most recent commit. */
export const get_last_commit_message = () =>
  execSync('git log -1 --pretty=%B', {encoding: 'utf8'}).trim();

/** Wrap the message with an ISO‑8601 timestamp header. */
export const format_record = msg =>
  `## ${new Date().toISOString()}\n${msg}\n\n`;


/** Append the record and stage the file for the next commit. */
export const append_and_stage = (log_path, record, add_next_patch) => {
  // Always append a newline before the message
  let msg = '\n';
  if (add_next_patch) {
    msg += '\n## next patch\n';
  }
  msg += record;
  console.log(`Appending to ${log_path}:\n${msg}`);
  appendFileSync(log_path, msg);
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
  console.log(`Changed files in last commit: ${changed_files.join(', ')}`);
  if (changed_files.length === 1 && changed_files[0] === log_path) return;

  // Check if '## next patch' already present in log file
  let already_present = false;
  if (existsSync(log_path)) {
    const log_content = readFileSync(log_path, {encoding: 'utf8'});
    if (log_content.includes('## next patch')) {
      already_present = true;
    }
  }

  const out = get_last_commit_message();
  if (already_present) {
    console.log('## next patch already present, skipping append.');
    return;
  }
  console.log(`Appending commit message to ${log_path}:\n${out}`);
  append_and_stage(log_path, out, true);
};

run();
