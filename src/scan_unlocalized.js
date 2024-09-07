import * as vscode from "vscode";
import { createWebviewPanel } from "../utils/webview";
import { COMMANDS, onCommand } from "./commands";
import { scanForUnlocalizedText } from "../utils/unlocalized_scanner";
import { findUnlocalizedText } from "./ai";
import { scanDirectory, scanSingleFile } from "../utils/scanner";

export const scanUnlocalized = {
  bind: (context) => {
    return async function (uri) {
      try {
        const stats = await vscode.workspace.fs.stat(uri);
        const config = vscode.workspace.getConfiguration("i18nAiExtractor");
        let results = [];

        if (stats.type === vscode.FileType.Directory) {
          results = await scanDirectory(
            uri.fsPath,
            config,
            scanExecutor,
            resultReducer
          );
        } else {
          const fileResult = await scanSingleFile(
            uri.fsPath,
            config,
            scanExecutor
          );
          results = resultReducer([fileResult]);
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

function scanExecutor({ code, fileType, fileRelativePath, filePath }) {
  const matches = scanForUnlocalizedText(code, fileType);

  return {
    filePath,
    occurrences: matches.map((match) => ({
      line: match.line,
      text: match.text,
      currentLineText: match.currentLineText,
      filePath,
      command: COMMANDS.JUMP_TO_FILE_LINE,
    })),
  };
}

function resultReducer(results) {
  return results.filter((r) => r && r.occurrences.length > 0);
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
