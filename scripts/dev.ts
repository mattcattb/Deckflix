const bunBin = process.execPath;

type ChildSpec = {
  name: string;
  cwd: string;
};

const children = new Map<string, Subprocess<"ignore", "inherit", "inherit">>();
let shuttingDown = false;
let exitCode = 0;

const specs: ChildSpec[] = [
  {
    name: "@deckflix/server",
    cwd: new URL("../packages/server", import.meta.url).pathname,
  },
  {
    name: "@deckflix/web",
    cwd: new URL("../packages/web", import.meta.url).pathname,
  },
];

const killProcessGroup = (proc: Subprocess<"ignore", "inherit", "inherit">, signal: string) => {
  if (proc.killed || proc.exitCode !== null) {
    return;
  }

  try {
    process.kill(-proc.pid, signal as NodeJS.Signals);
  } catch {
    proc.kill(signal);
  }
};

const shutdown = (signal: NodeJS.Signals, nextExitCode = 0) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  exitCode = nextExitCode;

  for (const proc of children.values()) {
    killProcessGroup(proc, signal);
  }

  setTimeout(() => {
    for (const proc of children.values()) {
      killProcessGroup(proc, "SIGKILL");
    }
  }, 1_500).unref();
};

for (const spec of specs) {
  const proc = Bun.spawn({
    cmd: [bunBin, "run", "dev"],
    cwd: spec.cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
    detached: true,
    onExit(_, code, signal) {
      children.delete(spec.name);

      if (!shuttingDown && (code !== 0 || signal !== null)) {
        exitCode = code ?? 1;
        shutdown("SIGTERM", exitCode);
      }

      if (children.size === 0) {
        process.exit(exitCode);
      }
    },
  });

  children.set(spec.name, proc);
}

process.on("SIGINT", () => shutdown("SIGINT", 130));
process.on("SIGTERM", () => shutdown("SIGTERM", 143));
