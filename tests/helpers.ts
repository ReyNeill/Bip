import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Runs `run` in a fresh temporary directory, removed afterwards.
export async function withTempDir<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(path.join(tmpdir(), "bip-test-"));

  try {
    return await run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export function writeFiles(root: string, files: Record<string, string>): void {
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf8");
  }
}

// What an in-process command printed and the exit code it set. The exit code is reset afterwards
// so a command that reports failure does not fail the test run itself.
export async function captureOutput(
  run: () => Promise<void>,
): Promise<{ output: string; exitCode: number }> {
  const { log, error } = console;
  const lines: string[] = [];
  const record = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };

  console.log = record;
  console.error = record;
  process.exitCode = 0;

  try {
    await run();
    return { output: lines.join("\n"), exitCode: Number(process.exitCode ?? 0) };
  } finally {
    console.log = log;
    console.error = error;
    process.exitCode = 0;
  }
}
