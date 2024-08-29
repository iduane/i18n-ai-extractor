import { readFileSync } from "fs";

const vscode = require("vscode");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

let outputChannel;

function activate(context) {
  outputChannel = vscode.window.createOutputChannel("i18n AI Extractor");

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

        if (!key) return;

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

        // Close existing webview if it exists
        if (global.unlocalizedTextPanel) {
          global.unlocalizedTextPanel.dispose();
        }

        // Create and show a new webview
        const panel = vscode.window.createWebviewPanel(
          "unlocalizedText",
          "Unlocalized Text",
          vscode.ViewColumn.Beside,
          {
            enableScripts: true,
            localResourceRoots: [
              vscode.Uri.joinPath(context.extensionUri, "media"),
            ],
          }
        );

        // Store the panel reference globally
        global.unlocalizedTextPanel = panel;

        // Generate HTML content for the webview
        panel.webview.html = getWebviewContent(
          unlocalizedTexts,
          config,
          panel.webview,
          context
        );

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
          async (message) => {
            switch (message.command) {
              case "jumpToLine":
                const position = new vscode.Position(message.line, 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(new vscode.Range(position, position));
                return;
              case "showInfo":
                vscode.window.showInformationMessage(message.text);
                return;
            }
          },
          undefined,
          context.subscriptions
        );

        // Add event listener for panel disposal
        panel.onDidDispose(
          () => {
            global.unlocalizedTextPanel = undefined;
          },
          null,
          context.subscriptions
        );
      }
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

async function findUnlocalizedText(text, config) {
  const openAIApiKey = config.get("openAIApiKey", "");
  const openAIBasePath = config.get(
    "openAIBasePath",
    "https://api.openai.com/v1"
  );
  const unlocalizedTextPrompt = config.get("unlocalizedTextPrompt", "");
  const i18nFunctionName = config.get("i18nFunctionName", "i18next.t");
  const maxRequestSize = config.get("maxRequestSize", 20000);

  if (!openAIApiKey) {
    vscode.window.showErrorMessage(
      "OpenAI API key not configured. Please set i18nAiExtractor.openAIApiKey in settings."
    );
    return [];
  }

  const trimmedText = trimCode(text, maxRequestSize);

  if (trimmedText.length >= maxRequestSize) {
    vscode.window.showWarningMessage(
      `The selected text has been trimmed to ${maxRequestSize} characters to fit within the request size limit.`
    );
  }

  const defaultPrompt = `${trimmedText}

  Analyze the provided code and extract all user-facing English text that requires translation for internationalization. Include:
  
  1. UI text: Labels, buttons, headings, placeholders
  2. Messages: Errors, warnings, confirmations, notifications
  3. Dynamic content: Sentences with variables (e.g., "Hello, {username}")
  4. Dates and times: Any format (e.g., "Last updated: {date}")
  5. Numbers and currencies: Including formatted values
  6. Units of measurement
  
  Ignore:
  - Code comments
  - Variable names
  - Text already wrapped in ${i18nFunctionName}('') or with data-i18n=""
  - HTML tags and attributes (unless they contain user-facing text)
  
  For each extracted text:
  1. Provide the exact text found
  
  Format the output as a JSON array of objects:
  [
    {
      "text": "extracted text"
    },
    ...
  ]`;

  const prompt = unlocalizedTextPrompt
    ? unlocalizedTextPrompt.replace("{{text}}", text)
    : defaultPrompt;

  return await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Scanning for unlocalized text",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0 });

      try {
        progress.report({ increment: 50, message: "Analyzing with OpenAI..." });
        const response = await axios.post(
          `${openAIBasePath}/chat/completions`,
          {
            model: "gpt-3.5-turbo",
            messages: [
              {
                role: "system",
                content:
                  "You are a helpful assistant that identifies unlocalized text in source code.",
              },
              { role: "user", content: prompt },
            ],
            max_tokens: 1000,
          },
          {
            headers: {
              Authorization: `Bearer ${openAIApiKey}`,
              "Content-Type": "application/json",
            },
          }
        );

        progress.report({ increment: 40, message: "Processing results..." });
        const aiOutput = response.data.choices[0].message.content.trim();

        // Show AI response in output panel
        outputChannel.appendLine("AI Response:");
        outputChannel.appendLine(aiOutput);
        outputChannel.show();

        const unlocalizedTexts = parseAIOutput(aiOutput, text, config);

        progress.report({ increment: 10, message: "Done" });
        return unlocalizedTexts;
      } catch (error) {
        console.error("Error detecting unlocalized text with OpenAI:", error);
        vscode.window.showErrorMessage(
          `Error detecting unlocalized text: ${error.message}`
        );
        return [];
      }
    }
  );
}

function parseAIOutput(aiOutput, fileContent, config) {
  const i18nFunctionName = config.get("i18nFunctionName", "i18next.t");
  const fileLines = fileContent.split("\n");
  let unlocalizedTexts = [];

  console.log("AI Response:", aiOutput);

  try {
    // Remove potential code block markers and trim
    const cleanedOutput = aiOutput.replace(/```json\n?|```\n?/g, "").trim();

    // Parse the JSON array from the AI output
    const parsedOutput = JSON.parse(cleanedOutput);

    console.log("Parsed AI Output:", JSON.stringify(parsedOutput, null, 2));

    // Process each item in the parsed array
    unlocalizedTexts = parsedOutput
      .map((item) => {
        const result = {
          line: findTextLineNumber(item.text, fileLines, i18nFunctionName),
          text: item.text,
        };
        console.log("Processed item:", JSON.stringify(result, null, 2));
        return result;
      })
      .filter((item) => item.line !== -2)
      .filter(
        (item, index, self) =>
          index ===
          self.findIndex(
            (t) => t.text === item.text // Compare text property for duplicates
          )
      );

    console.log(
      "Final unlocalized texts:",
      JSON.stringify(unlocalizedTexts, null, 2)
    );
  } catch (error) {
    console.error("Error parsing AI output:", error);
    vscode.window.showErrorMessage(`Error parsing AI output: ${error.message}`);
  }

  return unlocalizedTexts;
}

function findTextLineNumber(text, fileLines, i18nFunctionName) {
  // First, try to find the text enclosed in quotes
  let matchLine = -1;
  for (let i = 0; i < fileLines.length; i++) {
    if (
      fileLines[i].includes(`"${text}"`) ||
      fileLines[i].includes(`'${text}'`)
    ) {
      matchLine = i;
      break;
    }
  }

  if (matchLine === -1) {
    // If not found, search for the raw text
    for (let i = 0; i < fileLines.length; i++) {
      if (fileLines[i].includes(text)) {
        matchLine = i;
        break;
      }
    }
  }

  if (matchLine > -1) {
    // Check for multi-line i18n function call
    const surroundingLines = fileLines
      .slice(Math.max(0, matchLine - 2), matchLine + 3)
      .join("\n");
    // const i18nRegex = new RegExp(`${i18nFunctionName}\\s*\\(\\s*['"]${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\s*\\)`);
    const i18nRegex = new RegExp(
      `${i18nFunctionName}\\s*\\(\\s*['"][^'"]*${text.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      )}['"]\\s*[,\\)]`
    );

    if (i18nRegex.test(surroundingLines)) {
      return -2;
    }

    // Check for console.log, console.debug, and log.dev.debug
    const logRegex = new RegExp(
      `(console\\.log|console\\.debug|log\\.dev\\.debug)\\s*\\([^)]*${text.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      )}[^)]*\\)`
    );
    if (logRegex.test(surroundingLines)) {
      return -2;
    }
  }

  return matchLine;
}

function getWebviewContent(unlocalizedTexts, config, webview, context) {
  const i18nFunctionName = config.get("i18nFunctionName", "i18next.t");

  // read svg from OIG4.svg to string
  const iconContent = readFileSync(
    path.join(context.extensionPath, "OIG4.svg"),
    "utf8"
  );

  // Separate known and possible occurrences
  const knownOccurrences = unlocalizedTexts.filter((item) => item.line !== -1);
  const possibleOccurrences = unlocalizedTexts.filter(
    (item) => item.line === -1
  );

  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Unlocalized Text</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="bg-gray-100 p-6">
    <div class="flex items-center mb-6">
      ${iconContent}
      <h2 class="ml-2 text-2xl font-bold text-gray-800">Unlocalized Text</h2>
    </div>
    <div class="space-y-4">
      ${knownOccurrences
        .map(
          (item, index) => `
        <div class="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition duration-300 ease-in-out cursor-pointer" data-action="jumpToLine" data-line="${
          item.line
        }" data-text="${item.text}">
          <div class="flex justify-between items-center mb-2">
            <h3 class="text-lg font-semibold text-gray-800 truncate flex-grow">${
              item.text
            }</h3>
            <span class="text-sm text-gray-500 ml-2 whitespace-nowrap">Line ${
              item.line + 1
            }</span>
          </div>
        </div>
      `
        )
        .join("")}
      
      ${
        possibleOccurrences.length > 0
          ? `
        <h3 class="text-xl font-semibold mt-8 mb-4 text-gray-700">Possible Occurrences</h3>
        ${possibleOccurrences
          .map(
            (item, index) => `
          <div class="bg-gray-200 rounded-lg shadow-md p-4 hover:shadow-lg transition duration-300 ease-in-out">
            <div class="flex justify-between items-center mb-2">
              <h3 class="text-lg font-semibold text-gray-800 truncate flex-grow">${
                item.text
              }</h3>
              <span class="text-sm text-gray-500 ml-2 whitespace-nowrap">Possible ${
                index + 1
              }</span>
            </div>
          </div>
        `
          )
          .join("")}
      `
          : ""
      }
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      
      document.body.addEventListener('click', function(event) {
        let target = event.target;
        while (target != null && !target.dataset.action) {
          target = target.parentElement;
        }
        if (target && target.dataset.action === 'jumpToLine') {
          vscode.postMessage({
            command: 'jumpToLine',
            line: parseInt(target.dataset.line),
            text: target.dataset.text
          });
        }
      });

      function copyI18nFunction(text) {
        const i18nFunction = \`${i18nFunctionName}('\${text}')\`;
        navigator.clipboard.writeText(i18nFunction).then(() => {
          vscode.postMessage({
            command: 'showInfo',
            text: 'Copied to clipboard'
          });
        });
      }
    </script>
  </body>
  </html>`;
}

function trimCode(code, maxSize) {
  const lines = code.split("\n");
  const trimmedLines = [];
  let currentSize = 0;

  for (const line of lines) {
    // Remove comments and trim
    const trimmedLine = line.replace(/\/\/.*$/, "").trim();

    // Skip empty lines
    if (trimmedLine.length === 0) continue;

    // Truncate long lines
    const truncatedLine =
      trimmedLine.length > 100
        ? trimmedLine.substring(0, 97) + "..."
        : trimmedLine;

    // Check if adding this line would exceed the max size
    if (currentSize + truncatedLine.length + 1 > maxSize) {
      trimmedLines.push("// ... (truncated)");
      break;
    }

    trimmedLines.push(trimmedLine);
    currentSize += truncatedLine.length + 1; // +1 for newline
  }

  return trimmedLines.join("\n");
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
