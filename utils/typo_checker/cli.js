#!/usr/bin/env node
import { spellCheckDocument } from "cspell-lib";
import { promises as fs } from "fs";
export async function checkSpelling(phrase) {
  if (isIgnored(phrase)) {
    return [];
  }
  const result = await spellCheckDocument(
    { uri: "text.txt", text: phrase, languageId: "plaintext", locale: "en" },
    { generateSuggestions: false, noConfigSearch: true },
    { words: [], suggestionsTimeout: 2000 }
  );
  return result.issues.map((issue) => issue.text);
}

function isIgnored(text) {
  if (text.startsWith("//") || text.trim() === "") {
    return true;
  }
  if (text.split(".").length > 1) {
    return true;
  }
  if (/^[A-Z][A-Z0-9_]*$/.test(text)) {
    return true;
  }
  return false;
}

async function main() {
  const tempFilePath = process.argv.slice(2)[0];
  const fileContent = await fs.readFile(tempFilePath, "utf8");

  const phasesByFile = JSON.parse(String(fileContent));
  const result = [];
  for (const { filePath, phases } of phasesByFile) {
    const typos = [];
    for (const phase of phases) {
      const typo = await checkSpelling(phase);
      if (typo) {
        typos.push(...typo);
      }
    }
    if (typos.length > 0) {
      result.push({ filePath, typos: Array.from(new Set(typos)) });
    }
  }

  if (result.length > 0) {
    console.log(JSON.stringify(result, null, 2));
  }
}

main();
