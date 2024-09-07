import * as path from "path";
import * as vscode from "vscode";

import {
  collectAllI18nKeys,
  revisitI18nKeyPresenceInSource,
  scanForInuseI18nKeys,
} from "../utils/unused_scanner";
import { scanDirectory } from "../utils/scanner";
import { createWebviewPanel } from "../utils/webview";
import { COMMANDS, onCommand } from "./commands";

export const scanAllUnused = {
  bind: (context) => {
    return async function (uri) {
      try {
        const confirmedUnusedI18nKeys = [];
        const possibleBadDetectionKeys = [];
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Unused locale detection",
            cancellable: true,
          },
          async (progress, token) => {
            progress.report({
              message: "scanning for all used i18n keys",
            });
            const config = vscode.workspace.getConfiguration("i18nAiExtractor");
            const scanFoldersForUnused = config
              .get("scanFolderForUnused", "src")
              .split(",")
              .map((folder) => folder.trim());
            const folderPaths = scanFoldersForUnused.map((folder) =>
              path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, folder)
            );

            let usedI18nKeys = [];
            for (const folderPath of folderPaths) {
              const folderKeys = await scanDirectory(
                folderPath,
                config,
                scanForInuseI18nKeys,
                (r) => Array.from(new Set(r.flat()))
              );
              usedI18nKeys = usedI18nKeys.concat(folderKeys);
            }
            usedI18nKeys = Array.from(new Set(usedI18nKeys)); // Remove duplicates

            progress.report({
              message: "Scanning for defined i18n keys",
            });
            const localeFolder = config.get("localeResourceFolder", "locale");
            const localeFolderPath = path.join(
              vscode.workspace.workspaceFolders[0].uri.fsPath,
              localeFolder
            );
            const allI18Keys = await scanDirectory(
              localeFolderPath,
              config,
              collectAllI18nKeys.bind(context, config),
              (r) => r.flat()
            );

            progress.report({
              message: "calculating unused i18n keys",
            });
            let unusedI18nKeys = allI18Keys.filter(
              (item) =>
                !usedI18nKeys.some(
                  (usedKey) =>
                    usedKey &&
                    (usedKey === item.key ||
                      (usedKey.endsWith(".*") &&
                        item.key.startsWith(usedKey.replace(".*", ""))))
                )
            );

            const scanFileExtensions = config.get("scanFileExtensions", [
              "js",
              "jsx",
              "ts",
              "tsx",
            ]);
            const filePattern = `**/*.{${scanFileExtensions.join(",")}}`;
            const totalFiles = await vscode.workspace.findFiles(
              new vscode.RelativePattern(folderPaths[0], filePattern)
            );

            let filesScanned = 0;
            for (const file of totalFiles) {
              if (token.isCancellationRequested) {
                vscode.window.showInformationMessage(
                  "Scanning cancelled by user."
                );
                return;
              }

              const fileContent = await vscode.workspace.fs.readFile(file);
              const content = Buffer.from(fileContent).toString("utf8");

              unusedI18nKeys = unusedI18nKeys.filter((item) => {
                let isConfirmedUnused;
                if (item.key.endsWith("_plural")) {
                  isConfirmedUnused = !content.includes(
                    item.key.replace("_plural", "")
                  );
                } else {
                  isConfirmedUnused = !content.includes(item.key);
                }
                if (!isConfirmedUnused) {
                  possibleBadDetectionKeys.push(item);
                }
                return isConfirmedUnused;
              });

              filesScanned++;
              progress.report({
                increment: (filesScanned / totalFiles.length) * 100,
                message: `revisiting i18n keys in ${filesScanned}/${totalFiles.length} files`,
              });
            }

            confirmedUnusedI18nKeys.push(...unusedI18nKeys);
          }
        );

        if (confirmedUnusedI18nKeys.length > 0) {
          const resultReducer = (line) => (acc, item) => {
            const existingFile = acc.find(
              (file) => file.filePath === item.filePath
            );
            const occurrence = {
              text: item.key,
              currentLineText: item.key,
              line,
              command: COMMANDS.JUMP_TO_LOCALE_KEY,
              filePath: item.filePath,
            };

            if (existingFile) {
              existingFile.occurrences.push(occurrence);
            } else {
              acc.push({
                filePath: item.filePath,
                occurrences: [occurrence],
              });
            }

            return acc;
          };
          const results = confirmedUnusedI18nKeys.reduce(resultReducer(1), []);
          const badCases = possibleBadDetectionKeys.reduce(
            resultReducer(-1),
            []
          );

          createWebviewPanel(
            "Unused i18n Keys",
            "",
            results, // badCases,
            context,
            onCommand(),
            false,
            "Unused i18n Keys"
          );
        } else {
          vscode.window.showInformationMessage("No unused i18n keys found.");
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error scanning folder: ${error.message}`
        );
      }
    };
  },
};
