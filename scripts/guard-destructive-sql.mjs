import { execFileSync } from 'node:child_process';

const FORBIDDEN_SQL_PATTERN =
  /\b(DROP\s+TABLE|DROP\s+COLUMN|RENAME\s+COLUMN|RENAME\s+TABLE|SET\s+NOT\s+NULL)\b/i;
const NEWLINE_PATTERN = /\r?\n/;
const GUARDED_SQL_PATH_PATTERN = /(?:^|\/)drizzle\/.+\.sql$/i;

// This runs from the pre-commit hook, i.e. inside a live `git commit`. Every git
// call is therefore made explicitly non-interactive and bounded:
//   - `stdio: ['ignore', ...]` hands each child /dev/null instead of the inherited
//     stdin, so a git that decides to read stdin gets EOF rather than waiting on a
//     descriptor that never closes;
//   - GIT_OPTIONAL_LOCKS=0 stops git from trying to take the index lock the parent
//     commit may be holding;
//   - GIT_TERMINAL_PROMPT=0 and `--no-pager` remove the other paths that wait for a
//     human (credential/terminal prompts, a pager that blocks on a keypress);
//   - `timeout` + SIGKILL means a wedged child fails the guard instead of hanging
//     the commit forever.
const GIT_TIMEOUT_MS = 10_000;
const GIT_MAX_BUFFER = 20 * 1024 * 1024;
const GIT_ENV = {
  ...process.env,
  GIT_OPTIONAL_LOCKS: '0',
  GIT_TERMINAL_PROMPT: '0',
};

function git(args) {
  return execFileSync('git', ['--no-pager', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: GIT_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    maxBuffer: GIT_MAX_BUFFER,
    env: GIT_ENV,
  });
}

function listStagedFiles() {
  const output = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']);

  return output
    .split(NEWLINE_PATTERN)
    .map((name) => name.trim())
    .filter(Boolean);
}

function isGuardedMigration(path) {
  const normalized = path.replaceAll('\\', '/');
  return GUARDED_SQL_PATH_PATTERN.test(normalized);
}

function readStagedContent(path) {
  return git(['show', `:${path}`]);
}

function abort(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

let stagedSqlFiles;
try {
  stagedSqlFiles = listStagedFiles().filter(isGuardedMigration);
} catch (error) {
  abort(`[migration-guard] could not list staged files: ${error.message}`);
}

// Nothing to guard. lefthook.yml already restricts this job to staged migrations,
// so this is a second, belt-and-braces fast path for direct invocations.
if (stagedSqlFiles.length === 0) {
  process.exit(0);
}

let hasViolation = false;

for (const file of stagedSqlFiles) {
  let content;
  try {
    content = readStagedContent(file);
  } catch (error) {
    abort(
      `[migration-guard] could not read staged migration ${file}: ${error.message}`
    );
  }

  const lines = content.split(NEWLINE_PATTERN);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (FORBIDDEN_SQL_PATTERN.test(line)) {
      process.stderr.write(
        `[migration-guard] Destructive SQL detected in ${file}:${index + 1}\n`
      );
      process.stderr.write(`  ${line.trim()}\n`);
      hasViolation = true;
    }
  }
}

if (hasViolation) {
  process.stderr.write(
    '\nAdditive-only migration guard rejected this change. See db/MIGRATION_RULES.md Rules 1 and 3.\n'
  );
  process.exit(1);
}
