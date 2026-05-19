import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}
