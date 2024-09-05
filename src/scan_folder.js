import { readFileSync } from "fs";
import { promises as fs } from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { createWebviewPanel } from "../utils/webview";
import { COMMANDS, onCommand } from "./commands";
import { scanForUnlocalizedText } from "../utils/scanner";
import { findUnlocalizedText } from "../utils/ai";

export const scanFolderForI18n = {
  bind: (context) => {
    return async function (uri) {
      try {
        const stats = await fs.stat(uri.fsPath);
        const config = vscode.workspace.getConfiguration("i18nAiExtractor");
        let results = [];
        if (stats.isDirectory()) {
          results = await scanDirectory(uri.fsPath, config);
        } else {
          const fileResult = await scanSingleFile(uri.fsPath, config);
          if (fileResult) {
            results.push(fileResult);
          }
        }
        analysisRegexpMatches(results, context, config);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error scanning folder: ${error.message}`
        );
      }
    };
  },
};

async function scanDirectory(dirPath, config) {
  const results = [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      results.push(...(await scanDirectory(fullPath, config)));
    } else if (entry.isFile()) {
      const fileResult = await scanSingleFile(fullPath, config);
      if (fileResult) {
        results.push(fileResult);
      }
    }
  }

  return results;
}

async function scanSingleFile(filePath, config) {
  // only scan specific file extensions; and make file extension case configurable
  const fileExt = path.extname(filePath).slice(1);
  const allowedExtensions = config.get("scanFileExtensions", [
    "js",
    "jsx",
    "html",
    "vue",
    "mjs",
    "cj",
    "ts",
    "tsx",
    "json",
    "handlebars",
  ]);
  if (!allowedExtensions.includes(fileExt)) {
    return null;
  }
  const occurrences = scanUnlocalizedText(filePath, config);

  if (occurrences && occurrences.length > 0) {
    return {
      filePath,
      occurrences,
    };
  }
  return null;
}

function scanUnlocalizedText(filePath, config) {
  const fileContent = readFileSync(filePath, "utf8");
  const extName = path.extname(filePath).slice(1);
  const matches = scanForUnlocalizedText(fileContent, extName);

  const occurrences = [];
  for (let match of matches) {
    occurrences.push({
      line: match.line,
      text: match.text,
      currentLineText: match.currentLineText,
      filePath,
      command: COMMANDS.JUMP_TO_FILE_LINE,
    });
  }
  return occurrences;
}

async function analysisRegexpMatches(results, context, config) {
  const openAIApiKey = config.get("openAIApiKey", "");
  if (openAIApiKey) {
    const maxRequestSize = config.get("maxRequestSize", 20000);
    const MAX_BATCH_SIZE = maxRequestSize / 2;
    const MAX_TOTAL_SIZE = 200000;

    // Construct all occurrences as an array of strings
    const allOccurrences = results
      .map((result) => result.occurrences)
      .flat()
      .map((occ) => occ.currentLineText);

    const totalSize = allOccurrences.join("\n").length;

    if (totalSize > MAX_TOTAL_SIZE) {
      const proceed = await vscode.window.showWarningMessage(
        `The total text size (${totalSize} characters) is larger than 200,000 characters. This may take a while to process. Do you want to continue?`,
        "Yes",
        "No"
      );
      if (proceed !== "Yes") {
        vscode.window.showInformationMessage("Analysis cancelled by user.");
        return;
      }
    }

    // Process in batches
    const batches = [];
    let currentBatch = "";
    for (const occurrence of allOccurrences) {
      if (currentBatch.length + occurrence.length > MAX_BATCH_SIZE) {
        batches.push(currentBatch);
        currentBatch = occurrence;
      } else {
        currentBatch += (currentBatch ? "\n...\n...\n...\n" : "") + occurrence;
      }
    }
    if (currentBatch) {
      batches.push(currentBatch);
    }

    // Process each batch
    const unlocalizedTexts = [];
    for (const batch of batches) {
      const batchResults = await findUnlocalizedText(batch, config);
      unlocalizedTexts.push(...batchResults);
    }

    // Mark AI-identified unlocalized texts
    for (let { text } of unlocalizedTexts) {
      for (let result of results) {
        for (let occ of result.occurrences) {
          if (occ.text === text) {
            occ.ai = true;
          }
        }
      }
    }
  }

  createWebviewPanel("Unlocalized Text", "", results, context, onCommand());
}
