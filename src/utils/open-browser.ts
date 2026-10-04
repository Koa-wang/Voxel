import { spawn } from 'node:child_process';

/**
 * Open a URL in the user's default browser, cross-platform and dependency-free.
 * Failures are swallowed — opening the browser is a convenience, never a
 * reason to crash a dev server.
 */
export function openBrowser(url: string): void {
  let cmd: string;
  let args: string[];
  switch (process.platform) {
    case 'darwin':
      cmd = 'open';
      args = [url];
      break;
    case 'win32':
      cmd = 'cmd';
      args = ['/c', 'start', '""', url];
      break;
    default:
      cmd = 'xdg-open';
      args = [url];
  }
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, shell: process.platform === 'win32' });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    // ignore — environment may not have a browser
  }
}
