import { readFile, writeFile } from "node:fs/promises";

const indexPath = new URL("../src/index.ts", import.meta.url);
const index = await readFile(indexPath, "utf8");
await writeFile(indexPath, index.replace("export * from './generated/types';\n", ""));