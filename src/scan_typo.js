import * as path from "path";
import * as vscode from "vscode";

import { scanDirectory } from "../utils/scanner";
import { createWebviewPanel } from "../utils/webview";
import { COMMANDS, onCommand } from "./commands";
import {
  resetCSPellSetting,
  scanTyposInLocalFiles,
} from "../utils/typo_scanner.js";

export const scanAllTypos = {
  bind: (context) => {
    return async function () {
      try {
        let results = [];
        resetCSPellSetting();
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Typo detection",
            cancellable: true,
          },
          async (progress, token) => {
            progress.report({
              message: "scanning for typos in local files",
            });
            const config = vscode.workspace.getConfiguration("i18nAiExtractor");
            const scanFoldersForUnused = config
              .get("localeResourceFolder", "src")
              .split(",")
              .map((folder) => folder.trim());
            const folderPaths = scanFoldersForUnused.map((folder) =>
              path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, folder)
            );

            const scanFileExtensions = config.get("scanFileExtensions", [
              "js",
              "jsx",
              "ts",
              "tsx",
            ]);
            const filePattern = `**/*.{${scanFileExtensions.join(",")}}`;
            let totalFilesCount = 0;
            for (const folderPath of folderPaths) {
              const totalFiles = await vscode.workspace.findFiles(
                new vscode.RelativePattern(folderPath, filePattern)
              );
              totalFilesCount += totalFiles.length;
            }

            let scannedCount = 0;
            let allFileContents = [];

            for (const folderPath of folderPaths) {
              await scanDirectory(
                folderPath,
                config,
                async ({ code, fileType, filePath }) => {
                  scannedCount++;
                  progress.report({
                    increment: (scannedCount / totalFilesCount) * 100,
                    message: `scanned ${scannedCount}/${totalFilesCount} locale files`,
                  });
                  allFileContents.push({ code, fileType, filePath });
                  return null; // We'll process all files at once later
                },
                (r) => r.filter(Boolean)
              );
            }

            // Process all files at once
            const occurrences = await scanTyposInLocalFiles(allFileContents);

            results = occurrences.map(({ filePath, typos }) => ({
              filePath,
              occurrences: typos.map((typo) => ({
                ...typo,
                filePath,
                command: COMMANDS.JUMP_TO_FILE_LINE,
              })),
            }));
          }
        );

        if (results.length > 0) {
          createWebviewPanel(
            "Detected Typos",
            "",
            results,
            context,
            onCommand(),
            false,
            "Detected Typos"
          );
        } else {
          vscode.window.showInformationMessage("No typos found.");
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error scanning folder: ${error.message}`
        );
      }
    };
  },
};
