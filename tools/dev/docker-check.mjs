// The Docker preflight of the local dev commands: it fails at once with a hint when Docker is
// missing or not running, instead of leaving `docker compose up --wait` to fail or wait. Every
// `db-up` target runs it with `node tools/dev/docker-check.mjs`.
import { spawnSync } from 'node:child_process';

// `docker info` asks the daemon; a daemon that is still starting must not hold the command up.
const dockerInfo = () => spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 10_000 });

const failure = (problem) => ({
  ok: false,
  message: `${problem} Or run \`pnpm dev:memory\` to start without a database.`,
});

export const checkDocker = ({ run = dockerInfo } = {}) => {
  const { status, error } = run();
  if (error?.code === 'ENOENT') {
    return failure('Docker is not installed or not on the PATH. Install it and try again.');
  }
  if (error !== undefined || status !== 0) {
    return failure('Docker is not running. Start it and try again.');
  }
  return { ok: true };
};

if (import.meta.main) {
  const result = checkDocker();
  if (!result.ok) {
    console.error(result.message);
    process.exit(1);
  }
}
