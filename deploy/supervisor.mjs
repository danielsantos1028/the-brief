import { spawn } from 'node:child_process';

let stopping = false;
let exitCode = 0;
let shutdownTimer;
const children = new Set();

function stop(code) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const child of children) child.kill('SIGTERM');
  shutdownTimer = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
  }, 10000);
  shutdownTimer.unref();
}

for (const [program, args] of [
  [process.execPath, ['/app/dist/server/index.js']],
  ['nginx', ['-e', 'stderr', '-c', '/tmp/nginx.conf', '-g', 'daemon off;']],
]) {
  const child = spawn(program, args, { stdio: 'inherit' });
  children.add(child);
  child.on('error', () => {
    console.error('A required service could not start.');
    children.delete(child);
    stop(1);
  });
  child.on('exit', () => {
    children.delete(child);
    // Any unexpected child exit, even status 0, makes the container unhealthy.
    if (!stopping) stop(1);
    if (children.size === 0) {
      clearTimeout(shutdownTimer);
      process.exit(exitCode);
    }
  });
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => stop(0));
