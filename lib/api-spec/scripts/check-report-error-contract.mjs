import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const specPath = process.argv[2] ?? new URL("../openapi.yaml", import.meta.url);
const spec = await readFile(specPath, "utf8");
const lines = spec.split(/\r?\n/);

function block(header, indentation, within = lines) {
  const prefix = " ".repeat(indentation);
  const start = within.findIndex((line) => line === `${prefix}${header}`);
  assert.notEqual(start, -1, `Missing OpenAPI block: ${header}`);

  let end = within.length;
  for (let index = start + 1; index < within.length; index += 1) {
    const line = within[index];
    if (line.trim() && line.length - line.trimStart().length <= indentation) {
      end = index;
      break;
    }
  }
  return within.slice(start + 1, end);
}

for (const path of ["/reports:", "/reports/export:"]) {
  const pathBlock = block(path, 2);
  const getBlock = block("get:", 4, pathBlock);
  const responsesBlock = block("responses:", 6, getBlock);
  const badRequestBlock = block('"400":', 8, responsesBlock);
  const contentBlock = block("content:", 10, badRequestBlock);
  const jsonBlock = block("application/json:", 12, contentBlock);
  const schemaBlock = block("schema:", 14, jsonBlock);

  assert(
    schemaBlock.includes('                $ref: "#/components/schemas/ErrorEnvelope"'),
    `${path.slice(0, -1)} 400 application/json response must reference ErrorEnvelope`,
  );
}

console.log("Report 400 response contracts reference ErrorEnvelope.");