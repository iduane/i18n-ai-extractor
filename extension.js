import { scanUnlocalized } from "./src/scan_unlocalized";
import { createWebviewPanel } from "./utils/webview";
import { COMMANDS, onCommand } from "./src/commands";
import { findUnlocalizedText } from "./src/ai";
import { scanAllUnused } from "./src/scan_unused";
import { scanAllTypos } from "./src/scan_typo";
import { extractLocale } from "./src/extract_locale";

const vscode = require("vscode");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.extractLocale",
      extractLocale.bind(context)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("extension.extractLocaleNoConfirm", () => {
      vscode.commands.executeCommand(
        "extension.extractLocale",
        undefined,
        undefined,
        false
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("extension.openLocaleFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active text editor found.");
        return;
      }

      const selection = editor.selection;
      let text;

      if (
        selection.start.line === selection.end.line &&
        selection.start.character === selection.end.character
      ) {
        const line = editor.document.lineAt(selection.active.line);
        text = line.text.trim();
      } else {
        text = editor.document.getText(selection);
      }

      const i18nKeyMatch = text.match(/i18next\.t\(['"](.+?)['"]\)/);

      if (!i18nKeyMatch) {
        vscode.window.showErrorMessage("No i18n expression found.");
        return;
      }

      const i18nKey = i18nKeyMatch[1];
      const config = vscode.workspace.getConfiguration("i18nAiExtractor");
      const localePath = config.get("localePath", "");

      if (!localePath) {
        vscode.window.showErrorMessage("Locale file path not configured.");
        return;
      }

      const fullPath = path.join(
        vscode.workspace.workspaceFolders[0].uri.fsPath,
        localePath
      );
      const fileName = path.basename(fullPath, path.extname(fullPath));
      const key = i18nKey.replace(fileName + ".", "");
      const lineNumber = await findKeyLineNumber(fullPath, key);

      if (lineNumber === -1) {
        vscode.window.showErrorMessage(
          `Key "${i18nKey}" not found in locale file.`
        );
        return;
      }

      const uri = vscode.Uri.file(fullPath);
      const position = new vscode.Position(lineNumber, 0);
      await vscode.window.showTextDocument(uri, {
        selection: new vscode.Range(position, position),
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.scanForUnlocalizedText",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showErrorMessage("No active text editor found.");
          return;
        }

        const document = editor.document;
        const config = vscode.workspace.getConfiguration("i18nAiExtractor");
        const maxRequestSize = config.get("maxRequestSize", 20000);

        let text;
        let selection = editor.selection;

        // If there's no selection, use the entire document
        if (selection.isEmpty) {
          text = document.getText();
          if (text.length > maxRequestSize) {
            const choice = await vscode.window.showWarningMessage(
              `The entire file (${text.length} characters) exceeds the maximum request size of ${maxRequestSize} characters. Would you like to select a portion of the code?`,
              "Select Portion",
              "Proceed Anyway",
              "Cancel"
            );

            if (choice === "Select Portion") {
              // Allow user to make a selection
              const newSelection = await vscode.window.showTextDocument(
                document,
                { selection: new vscode.Selection(0, 0, 0, 0) }
              );
              if (newSelection) {
                selection = editor.selection;
                text = document.getText(selection);
              } else {
                return; // User cancelled the selection
              }
            } else if (choice === "Cancel") {
              return; // User cancelled the operation
            }
            // If "Proceed Anyway", we'll use the entire text as is
          }
        } else {
          text = document.getText(selection);
        }

        const unlocalizedTexts = await findUnlocalizedText(text, config);

        if (unlocalizedTexts.length === 0) {
          vscode.window.showInformationMessage(
            "No unlocalized text found in the current file."
          );
          return;
        }

        // Separate known and possible occurrences
        const knownOccurrences = unlocalizedTexts.filter(
          (item) => item.line !== -1
        );
        const possibleOccurrences = unlocalizedTexts.filter(
          (item) => item.line === -1
        );

        // get current active editor file path
        const currentFilePath = editor.document.uri.fsPath;

        const fileListOccurrences = [
          {
            filePath: currentFilePath,
            occurrences: knownOccurrences
              .concat(
                possibleOccurrences.map((item) => ({
                  ...item,
                  options: { disabled: true },
                }))
              )
              .map((item) => ({
                ...item,
                ai: true,
                filePath: currentFilePath,
                line: item.line > -1 ? item.line + 1 : item.line,
                command: COMMANDS.JUMP_TO_FILE_LINE,
              })),
          },
        ];

        createWebviewPanel(
          "Unlocalized Text",
          "",
          fileListOccurrences,
          context,
          onCommand()
        );
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.scanFolderForI18n",
      scanUnlocalized.bind(context)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.scanAllUnused",
      scanAllUnused.bind(context)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.scanAllTypos",
      scanAllTypos.bind(context)
    )
  );
}

async function findKeyLineNumber(filePath, key) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = String(content).split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(`"${key}"`)) {
        return i;
      }
    }
    return -1;
  } catch (error) {
    console.error("Error reading locale file:", error);
    return -1;
  }
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
