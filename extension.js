import { scanFolderForI18n } from "./src/scan_folder";
import { createWebviewPanel } from "./utils/webview";
import { COMMANDS, onCommand } from "./src/commands";
import { findUnlocalizedText } from "./utils/ai";
import { scanAllUnused } from "./src/scan_unused";

const vscode = require("vscode");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.extractLocale",
      async (text, line, requireConfirmation = true) => {
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
          editor =
            vscode.window.visibleTextEditors[
              vscode.window.visibleTextEditors.length - 1
            ];
        }
        if (!editor && (line === -1 || typeof line === "undefined")) {
          vscode.window.showErrorMessage("No active text editor found.");
          return;
        }
        if (!text) {
          const selection = editor.selection;
          if (!selection.isEmpty) {
            text = editor.document.getText(selection);
          } else {
            // If there's no selection, try fetch the highlight sentence under the cursor
            const position = editor.selection.active;
            const lineText = editor.document.lineAt(position.line).text;
            const sentenceRange = getSentenceRange(
              lineText,
              position.character
            );

            if (sentenceRange) {
              text = lineText.substring(sentenceRange.start, sentenceRange.end);
            } else {
              vscode.window.showErrorMessage(
                "No sentence found at cursor position."
              );
              return;
            }
          }
        }
        const unquotedText = text.replace(/^['"]|['"]$/g, "");

        const config = vscode.workspace.getConfiguration("i18nAiExtractor");
        const localePath = config.get("localePath", "");
        const openAIApiKey = config.get("openAIApiKey", "");
        const chatTemplate = config.get("chatTemplate", "");

        if (!localePath) {
          vscode.window.showErrorMessage(
            "Locale file path not configured. Please set i18nAiExtractor.localePath in settings."
          );
          return;
        }

        let suggestedKey = "";
        if (openAIApiKey) {
          suggestedKey = await suggestKeyWithOpenAI(
            unquotedText,
            openAIApiKey,
            chatTemplate
          );
        }

        const key = suggestedKey.replace(/^['"]|['"]$/g, "");

        const fullPath = path.join(
          vscode.workspace.workspaceFolders[0].uri.fsPath,
          localePath
        );
        const updatedKey = await updateLocaleFile(
          fullPath,
          key,
          unquotedText,
          requireConfirmation
        );
        const i18nFunctionName = config.get("i18nFunctionName", "i18next.t");
        if (updatedKey) {
          const fileName = path.basename(fullPath, path.extname(fullPath));
          let replacement = `${i18nFunctionName}('${fileName}.${updatedKey}')`;

          if (line > -1) {
            // Replace the text in the editor
            const lineText = editor.document.lineAt(line).text;
            const startIndex = lineText.indexOf(text);

            if (startIndex !== -1) {
              let rangeStart = startIndex;
              let rangeEnd = startIndex + text.length;

              // Check for quotes before and after the text
              if (
                lineText[rangeStart - 1] === '"' ||
                lineText[rangeStart - 1] === "'"
              ) {
                rangeStart--;
              }
              if (lineText[rangeEnd] === '"' || lineText[rangeEnd] === "'") {
                rangeEnd++;
              }

              if (
                lineText[rangeStart - 1] === ">" ||
                lineText[rangeEnd + 1] === "<"
              ) {
                replacement = `{${replacement}}`;
              }

              const range = new vscode.Range(
                new vscode.Position(line, rangeStart),
                new vscode.Position(line, rangeEnd)
              );
              editor.edit((editBuilder) => {
                editBuilder.replace(range, replacement);
              });
            }
          } else {
            // Replace the selected text
            if (editor.selection.isEmpty) {
              // use sentence range instead of selection
              const position = editor.selection.active;
              const lineText = editor.document.lineAt(position.line).text;
              const sentenceRange = getSentenceRange(
                lineText,
                position.character
              );
              if (sentenceRange) {
                let rangeStart = sentenceRange.start;
                let rangeEnd = sentenceRange.end;

                // Expand the range if the text has quotes
                if (
                  lineText[rangeStart - 1] === '"' ||
                  lineText[rangeStart - 1] === "'"
                ) {
                  rangeStart--;
                }
                if (lineText[rangeEnd] === '"' || lineText[rangeEnd] === "'") {
                  rangeEnd++;
                }
                if (
                  lineText[rangeStart - 1] === ">" ||
                  lineText[rangeEnd + 1] === "<"
                ) {
                  replacement = `{${replacement}}`;
                }

                const range = new vscode.Range(
                  new vscode.Position(position.line, rangeStart),
                  new vscode.Position(position.line, rangeEnd)
                );

                editor.edit((editBuilder) => {
                  editBuilder.replace(range, replacement);
                });
              } else {
                vscode.window.showErrorMessage(
                  "No valid sentence found at cursor position."
                );
              }
            } else {
              editor.edit((editBuilder) => {
                let range = editor.selection;
                const lineText = editor.document.lineAt(range.start.line).text;

                // Expand the range if the text has quotes
                let startChar = range.start.character;
                let endChar = range.end.character;

                if (
                  lineText[startChar - 1] === '"' ||
                  lineText[startChar - 1] === "'"
                ) {
                  startChar--;
                }
                if (lineText[endChar] === '"' || lineText[endChar] === "'") {
                  endChar++;
                }

                if (
                  lineText[startChar - 1] === ">" ||
                  lineText[endChar + 1] === "<"
                ) {
                  replacement = `{${replacement}}`;
                }

                range = new vscode.Selection(
                  new vscode.Position(range.start.line, startChar),
                  new vscode.Position(range.end.line, endChar)
                );

                editBuilder.replace(range, replacement);
              });
            }
          }
        }
      }
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
      scanFolderForI18n.bind(context)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.scanAllUnused",
      scanAllUnused.bind(context)
    )
  );
}

async function updateLocaleFile(
  filePath,
  key,
  translation,
  requireConfirmation = true
) {
  try {
    let localeData = {};
    try {
      const data = await fs.readFile(filePath, { encoding: "utf8" });
      localeData = JSON.parse(String(data));
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      // File doesn't exist, we'll create a new one
      vscode.window.showInformationMessage(
        `Locale file not found. Creating a new one at ${filePath}`
      );
    }

    // Allow user to modify the key
    let confirmedKey = key;
    if (requireConfirmation) {
      const modifiedKey = await vscode.window.showInputBox({
        prompt: "Confirm or modify the i18n key",
        value: key,
      });

      if (!modifiedKey) return null;
      confirmedKey = modifiedKey;
    }

    if (!confirmedKey) {
      return;
    }
    if (localeData[confirmedKey]) {
      if (localeData[confirmedKey] !== translation) {
        vscode.window.showErrorMessage(
          `The entered i18n key were taken by another occurrence: ${localeData[confirmedKey]}`
        );
      }
      return;
    }
    localeData[confirmedKey] = translation;
    await fs.writeFile(filePath, JSON.stringify(localeData, null, 2), "utf8");
    vscode.window.showInformationMessage(
      `Translation added for key: ${confirmedKey}`
    );
    return confirmedKey;
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error updating locale file: ${error.message}`
    );
    return null;
  }
}

async function suggestKeyWithOpenAI(text, apiKey, chatTemplate) {
  const config = vscode.workspace.getConfiguration("i18nAiExtractor");
  const openAIBasePath = config.get(
    "openAIBasePath",
    "https://api.openai.com/v1"
  );

  const defaultTemplate =
    'Suggest a concise i18n key for this text: "{{text}}", just a key, no dotted combination paths, as simple as possible, prefer to use lower case for no abbr words, use underline for multiple word keys, no explanation, no nothing, just the key.';
  const template = chatTemplate || defaultTemplate;
  const prompt = template.replace("{{text}}", text);

  return await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Suggesting i18n key",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0 });

      try {
        progress.report({ increment: 50, message: "Querying OpenAI..." });
        const response = await axios.post(
          `${openAIBasePath}/chat/completions`,
          {
            model: "gpt-3.5-turbo",
            messages: [
              {
                role: "system",
                content:
                  "You are a helpful assistant that suggests concise i18n keys for given text.",
              },
              { role: "user", content: prompt },
            ],
            max_tokens: 50,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          }
        );

        progress.report({ increment: 50, message: "Processing response..." });
        const suggestedKey = response.data.choices[0].message.content.trim();
        return suggestedKey;
      } catch (error) {
        console.error("Error suggesting key with OpenAI:", error);
        vscode.window.showErrorMessage(
          `Error suggesting i18n key: ${error.message}`
        );
        return "";
      }
    }
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

function getSentenceRange(lineText, cursorPosition) {
  // Find the start and end of the potential content
  let start = cursorPosition;
  let end = cursorPosition;

  while (start > 0 && /[\w+\s]/.test(lineText[start - 1])) {
    start--;
  }
  while (end < lineText.length && /[\w+\s]/.test(lineText[end])) {
    end++;
  }

  if (start === end) {
    return null;
  }
  return { start, end };
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
