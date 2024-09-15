import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

let ignoreWords = null;
let flagWords = null;

export function resetCSPellSetting() {
  ignoreWords = null;
  flagWords = null;
}

export async function scanTyposInLocalFiles(fileContents) {
  if (ignoreWords === null) {
    await loadCSpellConfig();
  }

  // Step 1: Create a temp JSON file with translations from all files
  const tempFilePath = await createTempTranslationsFile(fileContents);

  // Step 2: Call typo_checker CLI
  const checkResult = await runTypoChecker(tempFilePath);

  // Step 3: Parse and format the results
  const results = parseTypoCheckerResult(checkResult, fileContents);

  // Clean up temp file
  fs.unlinkSync(tempFilePath);

  return results;
}

async function loadCSpellConfig() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders) {
    const cspellPath = path.join(workspaceFolders[0].uri.fsPath, "cspell.json");
    try {
      const cspellContent = await fs.promises.readFile(cspellPath, "utf8");
      const cspellTextContent = String(cspellContent)
        .split("\n")
        .filter((m) => !m.trim().startsWith("//"))
        .join("\n");
      const cspellConfig = JSON.parse(cspellTextContent);
      ignoreWords = (cspellConfig.words || []).map((m) => m.toLowerCase());
      flagWords = cspellConfig.flagWords || [];
    } catch (error) {
      console.error("Error loading cspell.json:", error);
      ignoreWords = [];
      flagWords = [];
    }
  } else {
    ignoreWords = [];
    flagWords = [];
  }
}

async function createTempTranslationsFile(fileContents) {
  const flattenObject = (obj, prefix = "") => {
    return Object.keys(obj).reduce((acc, key) => {
      const prefixedKey = prefix ? `${prefix}.${key}` : key;
      if (typeof obj[key] === "object" && obj[key] !== null) {
        Object.assign(acc, flattenObject(obj[key], prefixedKey));
      } else {
        acc[prefixedKey] = obj[key];
      }
      return acc;
    }, {});
  };

  const translations = fileContents.map(({ code, filePath }) => {
    const jsonObject = JSON.parse(code);
    const flattenedObject = flattenObject(jsonObject);
    return {
      filePath,
      phases: Object.values(flattenedObject),
    };
  });

  const tempFilePath = path.join(__dirname, "temp_translations.json");
  await fs.promises.writeFile(
    tempFilePath,
    JSON.stringify(translations, null, 2)
  );
  return tempFilePath;
}

async function runTypoChecker(tempFilePath) {
  const extensionPath = vscode.extensions.getExtension(
    "iduane.i18n-ai-extractor"
  ).extensionPath;
  const command = `node ${path.join(
    extensionPath,
    "utils",
    "typo_checker"
  )} ${tempFilePath}`;
  try {
    const { stdout } = await execAsync(command, { cwd: extensionPath });
    return stdout;
  } catch (error) {
    console.error("Error running typo_checker:", error);
    return "";
  }
}

function parseTypoCheckerResult(checkResult, fileContents) {
  const results = [];

  try {
    const parsedResult = JSON.parse(checkResult);

    parsedResult.forEach(({ filePath, typos }) => {
      const originalCode = fileContents.find(
        (f) => f.filePath === filePath
      ).code;
      const lines = originalCode.split("\n");

      const fileResults = typos
        .map((typo) => {
          const lineIndex = lines.findIndex((l) => l.includes(typo));
          if (lineIndex !== -1) {
            const keyMatch = lines[lineIndex].match(/^"([^"]+)":/);
            return {
              text: typo,
              line: lineIndex + 1,
              currentLineText: lines[lineIndex],
              key: keyMatch ? keyMatch[1] : "",
              suggestion: "", // CLI doesn't provide suggestions
            };
          }
          return null;
        })
        .filter(Boolean);

      results.push({
        filePath,
        typos: fileResults.filter(
          (result) =>
            !ignoreWords.includes(result.text.toLowerCase()) &&
            (!result.text.match(/^[A-Z]+$/) || flagWords.includes(result.text))
        ),
      });
    });
  } catch (error) {
    console.error("Error parsing typo checker result:", error);
  }

  return results;
}
