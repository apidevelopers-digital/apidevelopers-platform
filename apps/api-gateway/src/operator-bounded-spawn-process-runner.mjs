import { spawn } from "node:child_process";

export function createBoundedSpawnProcessRunner() {
  return function processRunner({
    executable,
    args = [],
    shell = false,
    stdinBytes,
    inheritEnvironment = false,
    timeoutMs,
    maxStdoutBytes,
    maxStderrBytes,
  } = {}) {
    if (shell !== false) throw new Error("process_runner_shell_denied");
    if (!(stdinBytes instanceof Uint8Array)) throw new TypeError("stdinBytes must be a Uint8Array");

    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        shell: false,
        env: inheritEnvironment ? process.env : {},
        stdio: ["pipe", "pipe", "pipe"],
      });

      const stdout = [];
      const stderr = [];
      let stdoutSize = 0;
      let stderrSize = 0;
      let timedOut = false;
      let settled = false;

      const finish = (error, exitCode = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) return reject(error);
        resolve({
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr),
          exitCode: Number.isInteger(exitCode) ? exitCode : 1,
          timedOut,
        });
      };

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);
      timer.unref?.();

      child.stdout.on("data", (chunk) => {
        stdoutSize += chunk.length;
        if (stdoutSize > maxStdoutBytes) {
          child.kill("SIGKILL");
          return;
        }
        stdout.push(Buffer.from(chunk));
      });
      child.stderr.on("data", (chunk) => {
        stderrSize += chunk.length;
        if (stderrSize > maxStderrBytes) {
          child.kill("SIGKILL");
          return;
        }
        stderr.push(Buffer.from(chunk));
      });
      child.once("error", (error) => finish(error));
      child.once("close", (code) => finish(null, code));

      const stdinCopy = Buffer.from(stdinBytes);
      child.stdin.end(stdinCopy, () => stdinCopy.fill(0));
    });
  };
}
