import * as path from "path";
import * as vscode from "vscode";
import * as fs from "fs/promises";
import axios from "axios";

export const extractLocale = {
  bind: (context) => {
    return async (text, line, requireConfirmation = true) => {
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
          const sentenceRange = getSentenceRange(lineText, position.character);

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

      const fullPath = path.join(
        vscode.workspace.workspaceFolders[0].uri.fsPath,
        localePath
      );
      let updatedKey;
      const reuseableKey = await hasReuseableLocale(fullPath, unquotedText);
      if (reuseableKey) {
        updatedKey = reuseableKey;
      } else {
        let suggestedKey = "";
        if (openAIApiKey) {
          suggestedKey = await suggestKeyWithOpenAI(
            unquotedText,
            openAIApiKey,
            chatTemplate
          );
        }

        const key = suggestedKey.replace(/^['"]|['"]$/g, "");

        updatedKey = await updateLocaleFile(
          fullPath,
          key,
          unquotedText,
          requireConfirmation
        );
      }
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
    };
  },
};

async function hasReuseableLocale(filePath, translation) {
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

    for (const key in localeData) {
      if (localeData[key] === translation) {
        // ask user confirm to re-use the key; if agree, return the key; if not, return null
        const confirm = await vscode.window.showInformationMessage(
          `The translation "${translation}" already exists with the key "${key}". Do you want to re-use it?`,
          { modal: true },
          "Apply"
        );
        if (confirm === "Apply") {
          return key;
        }
        return null;
      }
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error updating locale file: ${error.message}`
    );
    return null;
  }
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

      const gptModel = config.get("gptModel", "gpt-3.5-turbo"); // Add this line

      
      try {
        progress.report({ increment: 50, message: "Querying OpenAI..." });
        const response = await axios.post(
          `${openAIBasePath}/chat/completions`,
          {
            model: gptModel,
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

function getSentenceRange(lineText, cursorPosition) {
  // Find the start and end of the potential content
  let start = cursorPosition;
  let end = cursorPosition;

  while (start > 0 && /[\w+\s\.]/.test(lineText[start - 1])) {
    start--;
  }
  while (end < lineText.length && /[\w+\s\.]/.test(lineText[end])) {
    end++;
  }

  if (start === end) {
    return null;
  }
  return { start, end };
}
