import pc from 'picocolors';

const now = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export const logger = {
  info(msg: string, ...rest: unknown[]): void {
    console.log(`${pc.dim(now())} ${pc.cyan('unibits')} ${msg}`, ...rest);
  },
  success(msg: string, ...rest: unknown[]): void {
    console.log(`${pc.dim(now())} ${pc.green('✔')} ${msg}`, ...rest);
  },
  warn(msg: string, ...rest: unknown[]): void {
    console.log(`${pc.dim(now())} ${pc.yellow('⚠')} ${msg}`, ...rest);
  },
  error(msg: string, ...rest: unknown[]): void {
    console.error(`${pc.dim(now())} ${pc.red('✖')} ${msg}`, ...rest);
  },
  debug(msg: string, ...rest: unknown[]): void {
    if (process.env.UNIBITS_DEBUG) console.log(`${pc.dim(now())} ${pc.gray('·')} ${msg}`, ...rest);
  },
  raw(msg: string, ...rest: unknown[]): void {
    console.log(msg, ...rest);
  },
};

export function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
