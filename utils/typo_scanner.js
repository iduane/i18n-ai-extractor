import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import Spellchecker from "hunspell-spellchecker";

let ignoreWords = null;
let flagWords = null;

export function resetCSPellSetting() {
  ignoreWords = null;
  flagWords = null;
}

export async function scanTyposInLocalFiles({ code, fileType }) {
  if (ignoreWords === null) {
    // Load ignoreWords from workspace folder cspell.json - words
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      const cspellPath = path.join(
        workspaceFolders[0].uri.fsPath,
        "cspell.json"
      );
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
      }
    } else {
      ignoreWords = [];
    }
  }

  const spellchecker = new Spellchecker();
  // Load the appropriate dictionary based on fileType or use a default
  const dictionaryPath = path.join(__dirname, "../dictionaries/en_US");
  const dictionary = spellchecker.parse({
    aff: fs.readFileSync(`${dictionaryPath}/index.aff`),
    dic: fs.readFileSync(`${dictionaryPath}/index.dic`),
  });
  spellchecker.use(dictionary);

  const lines = code.split("\n");
  const results = [];

  lines.forEach((line, index) => {
    const match = line.trim().match(/^"([^"]+)":\s*"([^"]+)"/);
    if (match) {
      const [, key, value] = match;
      const words = value
        .split(/\s+/)
        .flatMap((word) => word.split(/(?<=[a-z])(?=[A-Z])/))
        .map((m) => (/^[a-zA-Z]+$/.test(m) ? m : null))
        .filter(Boolean);

      words.forEach((word) => {
        if (
          !word.match(/^[A-Z]+$/) && // Ignore all uppercase words
          !ignoreWords.includes(word.toLowerCase()) &&
          (!spellchecker.check(word) || flagWords.includes(word))
        ) {
          results.push({
            text: `${word}`,
            line: index + 1,
            currentLineText: line,
            key,
          });
        }
      });
    }
  });

  return results;
}
