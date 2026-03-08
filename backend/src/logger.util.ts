import * as fs from 'fs';
import * as path from 'path';

export const LOG_FILE = path.resolve(process.cwd(), 'logs/app.log');

/** Tee all stdout/stderr output to logs/app.log (appends, does not clear). No-op in production. */
export function setupFileLogging() {
  if (process.env.NODE_ENV === 'production') return;
  try { fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true }); } catch { return; }
  const stream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

  const origStdout = process.stdout.write.bind(process.stdout);
  const origStderr = process.stderr.write.bind(process.stderr);

  (process.stdout.write as unknown) = (chunk: unknown, ...args: unknown[]) => {
    stream.write(chunk as string);
    return (origStdout as (...a: unknown[]) => boolean)(chunk, ...args);
  };

  (process.stderr.write as unknown) = (chunk: unknown, ...args: unknown[]) => {
    stream.write(chunk as string);
    return (origStderr as (...a: unknown[]) => boolean)(chunk, ...args);
  };
}

/** Clear the log file — call this at the start of each game. No-op in production. */
export function clearLogFile() {
  if (process.env.NODE_ENV === 'production') return;
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.writeFileSync(LOG_FILE, `--- Game started at ${new Date().toISOString()} ---\n`);
  } catch { /* ignore */ }
}
