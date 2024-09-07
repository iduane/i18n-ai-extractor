import * as path from "path";
import * as vscode from "vscode";

import {
  collectAllI18nKeys,
  revisitI18nKeyPresenceInSource,
  scanForInuseI18nKeys,
} from "../utils/unused_scanner";
import { scanDirectory } from "../utils/scanner";

export const scanAllUnused = {
  bind: (context) => {
    return async function (uri) {
      try {
        const config = vscode.workspace.getConfiguration("i18nAiExtractor");
        const scanFolderForUnused = config.get("scanFolderForUnused", "src");
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
