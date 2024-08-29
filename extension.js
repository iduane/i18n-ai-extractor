const vscode = require("vscode");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("extension.extractLocale", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active text editor found.");
        return;
      }

      const selection = editor.selection;
      const text = editor.document.getText(selection);
      const unquotedText = text.replace(/^['"]|['"]$/g, "");

      if (!text) {
        vscode.window.showErrorMessage("No text found.");
        return;
      }

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
      // const key = await vscode.window.showInputBox({
      //   prompt: "Enter the i18n key",
      //   value: suggestedKey,
      // });

      if (!key) return;

      const fullPath = path.join(
        vscode.workspace.workspaceFolders[0].uri.fsPath,
        localePath
      );
      const updatedKey = await updateLocaleFile(fullPath, key, unquotedText);
      if (updatedKey) {
        editor.edit((editBuilder) => {
          const fileName = path.basename(fullPath, path.extname(fullPath));
          editBuilder.replace(
            selection,
            `i18next.t('${fileName}.${updatedKey}')`
          );
        });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("extension.openLocaleFile", async () => {
      // Create an output channel
      // const outputChannel = vscode.window.createOutputChannel("i18n AI Extractor");

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active text editor found.");
        return;
      }

      const selection = editor.selection;
      let text;
      // outputChannel.appendLine(`Selection starts at line: ${selection.start.line}, character: ${selection.start.character}`);
      // outputChannel.appendLine(`Selection ends at line: ${selection.end.line}, character: ${selection.end.character}`);
      // outputChannel.appendLine(`Selected text: ${editor.document.getText(selection)}`);
      // outputChannel.show(); // This will make the output channel visible

      if (selection.start.line === selection.end.line && selection.start.character === selection.end.character) {
        const line = editor.document.lineAt(selection.active.line);
        text = line.text.trim();
      } else {
        text = editor.document.getText(selection);
      }

      const i18nKeyMatch = text.match(/i18next\.t\(['"](.+?)['"]\)/);

      if (!i18nKeyMatch) {
        vscode.window.showErrorMessage(
          "No i18n expression found."
        );
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
    vscode.commands.registerCommand("extension.scanForUnlocalizedText", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active text editor found.");
        return;
      }

      const document = editor.document;
      const text = document.getText();
      const unlocalizedTexts = await findUnlocalizedText(text);

      if (unlocalizedTexts.length === 0) {
        vscode.window.showInformationMessage("No unlocalized text found in the current file.");
        return;
      }

      // Create and show a new webview
      const panel = vscode.window.createWebviewPanel(
        'unlocalizedText',
        'Unlocalized Text',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true
        }
      );

      // Generate HTML content for the webview
      panel.webview.html = getWebviewContent(unlocalizedTexts);

      // Handle messages from the webview
      panel.webview.onDidReceiveMessage(
        message => {
          switch (message.command) {
            case 'jumpToLine':
              const position = new vscode.Position(message.line, 0);
              editor.selection = new vscode.Selection(position, position);
              editor.revealRange(new vscode.Range(position, position));
              return;
          }
        },
        undefined,
        context.subscriptions
      );
    })
  );
}

async function updateLocaleFile(filePath, key, translation) {
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
    const modifiedKey = await vscode.window.showInputBox({
      prompt: "Confirm or modify the i18n key",
      value: key,
    });

    if (!modifiedKey) return null;

    localeData[modifiedKey] = translation;
    await fs.writeFile(filePath, JSON.stringify(localeData, null, 2), "utf8");
    vscode.window.showInformationMessage(
      `Translation added for key: ${modifiedKey}`
    );
    return modifiedKey;
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

  try {
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

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error("Error suggesting key with OpenAI:", error);
    return "";
  }
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

async function findUnlocalizedText(text) {
  const config = vscode.workspace.getConfiguration("i18nAiExtractor");
  const openAIApiKey = config.get("openAIApiKey", "");
  const openAIBasePath = config.get("openAIBasePath", "https://api.openai.com/v1");
  const unlocalizedTextPrompt = config.get("unlocalizedTextPrompt", "");

  if (!openAIApiKey) {
    vscode.window.showErrorMessage("OpenAI API key not configured. Please set i18nAiExtractor.openAIApiKey in settings.");
    return [];
  }

  const defaultPrompt = `${text}

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
  - Text already wrapped in i18next.t('') or with data-i18n=""
  - HTML tags and attributes (unless they contain user-facing text)
  
  For each extracted text:
  1. Provide the exact text found
  2. Suggest a concise i18n key (lowercase, underscores for spaces)
  3. Include the line number where it appears
  
  Format the output as a JSON array of objects:
  [
    {
      "text": "extracted text",
      "suggestedKey": "suggested_key",
      "line": lineNumber
    },
    ...
  ]`;

  const prompt = unlocalizedTextPrompt ? unlocalizedTextPrompt.replace("{{text}}", text) : defaultPrompt;

  try {
    const response = await axios.post(
      `${openAIBasePath}/chat/completions`,
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that identifies unlocalized text in source code.",
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

    const aiOutput = response.data.choices[0].message.content.trim();
    const unlocalizedTexts = parseAIOutput(aiOutput, text);
    return unlocalizedTexts;
  } catch (error) {
    console.error("Error detecting unlocalized text with OpenAI:", error);
    vscode.window.showErrorMessage(`Error detecting unlocalized text: ${error.message}`);
    return [];
  }
}

function parseAIOutput(aiOutput, fileContent) {
  const lines = aiOutput.split('\n');
  const unlocalizedTexts = [];
  const fileLines = fileContent.split('\n');

  lines.forEach(line => {
    const match = line.match(/"([^"]+)":\s*"([^"]+)"/);
    if (match) {
      const [, key, text] = match;
      const lineNumber = findTextLineNumber(text, fileLines);
      if (lineNumber !== -1) {
        unlocalizedTexts.push({
          line: lineNumber,
          text: text,
          suggestedKey: key
        });
      }
    }
  });

  return unlocalizedTexts;
}

function findTextLineNumber(text, fileLines) {
  for (let i = 0; i < fileLines.length; i++) {
    if (fileLines[i].includes(text)) {
      return i;
    }
  }
  return -1;
}

function getWebviewContent(unlocalizedTexts) {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Unlocalized Text</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="bg-gray-100 p-6">
    <h2 class="text-2xl font-bold mb-6 text-gray-800">Unlocalized Text</h2>
    <div class="space-y-4">
      ${unlocalizedTexts.map((item, index) => `
        <div class="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition duration-300 ease-in-out cursor-pointer" onclick="jumpToLine(${item.line})">
          <div class="flex justify-between items-center mb-2">
            <strong class="text-lg text-cyan-600">${index + 1}. Line ${item.line + 1}</strong>
            <span class="text-sm text-gray-500">Suggested key: ${item.suggestedKey}</span>
          </div>
          <p class="text-gray-700">${item.text}</p>
        </div>
      `).join('')}
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      function jumpToLine(line) {
        vscode.postMessage({
          command: 'jumpToLine',
          line: line
        });
      }
    </script>
  </body>
  </html>`;
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
