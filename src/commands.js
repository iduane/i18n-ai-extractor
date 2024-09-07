import { readFileSync } from "fs";
import path from "path";
import * as vscode from "vscode";

export const COMMANDS = {
  JUMP_TO_FILE_LINE: "jumpToFileLine",
  JUMP_TO_LOCALE_KEY: "jumpToLocaleKey",
};

export function onCommand() {
  return (message) => {
    switch (message.command) {
      case COMMANDS.JUMP_TO_FILE_LINE:
        jumpToFileLine(message);
        return;
      case COMMANDS.JUMP_TO_LOCALE_KEY:
        jumpToLocaleKey(message);
        return;
    }
  };
}

function jumpToFileLine(message) {
  const filePath = message.filePath;
  const uri = vscode.Uri.file(filePath);
  vscode.workspace.openTextDocument(uri).then((doc) => {
    vscode.window
      .showTextDocument(doc, { viewColumn: vscode.ViewColumn.One })
      .then((editor) => {
        const position = new vscode.Position(message.line - 1, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position));
      });
  });
  return;
}

function jumpToLocaleKey(message) {
  try {
    const filePath = message.filePath;
    const config = vscode.workspace.getConfiguration("i18nAiExtractor");
    const localeFolder = config.get("localeResourceFolder", "locale");
    // Get locale file relative path to localeFolder
    const projectPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const relativePath = path.relative(
      path.join(projectPath, localeFolder),
      filePath
    );
    const uniqueIdentifier = relativePath
      .replace(/\.\w+$/, "")
      .replace(/\//g, ".");
    const parts = message.text.split(" - ");
    const key = parts[parts.length - 1];
    const localeKey = key.substring(uniqueIdentifier.length + 1);

    // Read the locale file content
    const localeFileContent = readFileSync(filePath, "utf8");

    // Find the line number of the key in the file
    const lines = localeFileContent.split("\n");
    const keyParts = localeKey.split(".");
    let lineNumber = -1;
    let keyMatchedIndex = 0;
    let currentIndentation = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineIndentation = lines[i].match(/^\s*/)[0].length;
      const match = line.match(/^"([^"]+)":/);

      if (match) {
        const key = match[1];
        if (key === keyParts[keyMatchedIndex]) {
          keyMatchedIndex++;
          currentIndentation = lineIndentation;

          if (keyMatchedIndex === keyParts.length) {
            lineNumber = i;
            break;
          }
        } else if (lineIndentation <= currentIndentation) {
          keyMatchedIndex = 0;
          currentIndentation = 0;
        }
      }
    }

    if (keyMatchedIndex !== keyParts.length) {
      throw new Error(`Locale key not found: ${localeKey}`);
    }

    const uri = vscode.Uri.file(filePath);

    vscode.workspace.openTextDocument(uri).then((doc) => {
      vscode.window
        .showTextDocument(doc, { viewColumn: vscode.ViewColumn.One })
        .then((editor) => {
          const position = new vscode.Position(lineNumber, 0);
          editor.selection = new vscode.Selection(position, position);
          editor.revealRange(new vscode.Range(position, position));
        });
    });
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error jumping to locale key: ${error.message}`
    );
  }
}
