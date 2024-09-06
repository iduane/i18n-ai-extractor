import { readFileSync } from "fs";
import { promises as fs } from "fs";
import * as path from "path";
import * as vscode from "vscode";

import {
  collectAllI18nKeys,
  revisitI18nKeyPresenceInSource,
  scanForInuseI18nKeys,
} from "../utils/unused_scanner";

export const scanAllUnused = {
  bind: (context) => {
    return async function (uri) {
      try {
        const config = vscode.workspace.getConfiguration("i18nAiExtractor");
        // const scanFolderForUnused = config.get("scanFolderForUnused", "src");
        const scanFolderForUnused =
          "/src/scripts/pages/Configuration/FeedAndChanel/FeedEditor/IncidentFeed"; // debugger
        const folderPath = path.join(
          vscode.workspace.workspaceFolders[0].uri.fsPath,
          scanFolderForUnused
        );
        let usedI18nKeys = await scanDirectory(
          folderPath,
          config,
          scanForInuseI18nKeys,
          (r) => Array.from(new Set(r))
        );

        const localeFolder = config.get("localeResourceFolder", "locale");
        const allI18Keys = await scanDirectory(
          localeFolder,
          config,
          collectAllI18nKeys,
          (r) => Array.from(new Set(r))
        );

        const unusedI18nKeys = allI18Keys.filter(
          (key) => !usedI18nKeys.includes(key)
        );

        const confirmedUnusedI18nKeys = [];
        for (let unusedKey of unusedI18nKeys) {
          const boolArr = await scanDirectory(
            localeFolder,
            config,
            revisitI18nKeyPresenceInSource,
            (r) => (r.includes(true) ? [true] : [false])
          );
          if (boolArr[0] === false) {
            confirmedUnusedI18nKeys.push(unusedKey);
          }
        }

        vscode.window.showInformationMessage(
          `Found ${confirmedUnusedI18nKeys.length} unused i18n keys.`
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error scanning folder: ${error.message}`
        );
      }
    };
  },
};

async function scanDirectory(dirPath, config, executor, resultReducer) {
  const results = [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      results.push(
        ...(await scanDirectory(fullPath, config, executor, resultReducer))
      );
    } else if (entry.isFile()) {
      const fileResult = await scanSingleFile(fullPath, config, executor);
      if (fileResult) {
        results.push(...fileResult);
      }
    }
  }

  return resultReducer(results);
}

async function scanSingleFile(filePath, config, executor) {
  const skipFolders = config.get("scanSkipFolders", []);
  const skipFoldersRegex = new RegExp(skipFolders.join("|"));
  if (skipFoldersRegex.test(filePath)) {
    return null;
  }
  // only scan specific file extensions; and make file extension case configurable
  const fileExt = path.basename(filePath).split(".").slice(1).join(".");
  const allowedExtensions = config.get("scanFileExtensions", []);
  if (!allowedExtensions.includes(fileExt)) {
    return null;
  }
  const skipExtensions = config.get("scanSkipFileExtensions", []);
  if (skipExtensions.includes(fileExt)) {
    return null;
  }
  const code = readFileSync(filePath, "utf8");
  const result = executor(code, fileExt);

  return result;
}
