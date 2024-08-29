const vscode = require("vscode");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

let outputChannel;

function activate(context) {
  outputChannel = vscode.window.createOutputChannel("i18n AI Extractor");

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
      const config = vscode.workspace.getConfiguration("i18nAiExtractor");
      const unlocalizedTexts = await findUnlocalizedText(text, config);

      if (unlocalizedTexts.length === 0) {
        vscode.window.showInformationMessage("No unlocalized text found in the current file.");
        return;
      }

      // Close existing webview if it exists
      if (global.unlocalizedTextPanel) {
        global.unlocalizedTextPanel.dispose();
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

      // Store the panel reference globally
      global.unlocalizedTextPanel = panel;

      // Generate HTML content for the webview
      panel.webview.html = getWebviewContent(unlocalizedTexts, config);

      // Handle messages from the webview
      panel.webview.onDidReceiveMessage(
        message => {
          switch (message.command) {
            case 'jumpToLine':
              const position = new vscode.Position(message.line, 0);
              editor.selection = new vscode.Selection(position, position);
              editor.revealRange(new vscode.Range(position, position));
              return;
            case 'showInfo':
              vscode.window.showInformationMessage(message.text);
              return;
          }
        },
        undefined,
        context.subscriptions
      );

      // Add event listener for panel disposal
      panel.onDidDispose(() => {
        global.unlocalizedTextPanel = undefined;
      }, null, context.subscriptions);
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

  return await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: "Suggesting i18n key",
    cancellable: false
  }, async (progress) => {
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
      vscode.window.showErrorMessage(`Error suggesting i18n key: ${error.message}`);
      return "";
    }
  });
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
  const openAIBasePath = config.get("openAIBasePath", "https://api.openai.com/v1");
  const unlocalizedTextPrompt = config.get("unlocalizedTextPrompt", "");
  const i18nFunctionName = config.get("i18nFunctionName", "i18next.t");

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

  const prompt = unlocalizedTextPrompt ? unlocalizedTextPrompt.replace("{{text}}", text) : defaultPrompt;

  return await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: "Scanning for unlocalized text",
    cancellable: false
  }, async (progress) => {
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
      vscode.window.showErrorMessage(`Error detecting unlocalized text: ${error.message}`);
      return [];
    }
  });
}

function parseAIOutput(aiOutput, fileContent, config) {
  const i18nFunctionName = config.get("i18nFunctionName", "i18next.t");
  const fileLines = fileContent.split('\n');
  let unlocalizedTexts = [];

  console.log("AI Response:", aiOutput);

  try {
    // Remove potential code block markers and trim
    const cleanedOutput = aiOutput.replace(/```json\n?|```\n?/g, '').trim();
    
    // Parse the JSON array from the AI output
    const parsedOutput = JSON.parse(cleanedOutput);

    console.log("Parsed AI Output:", JSON.stringify(parsedOutput, null, 2));

    // Process each item in the parsed array
    unlocalizedTexts = parsedOutput.map(item => {
      const result = {
        line: findTextLineNumber(item.text, fileLines, i18nFunctionName),
        text: item.text
      };
      console.log("Processed item:", JSON.stringify(result, null, 2));
      return result;
    }).filter(item => item.line !== -2);

    console.log("Final unlocalized texts:", JSON.stringify(unlocalizedTexts, null, 2));
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
    if (fileLines[i].includes(`"${text}"`) || fileLines[i].includes(`'${text}'`)) {
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

  // scan the matched line, if it's inside i18nFunctionName(''), return -2
  if (matchLine > -1 && fileLines[matchLine].includes(`${i18nFunctionName}('${text}')`)) {
    return -2;
  }

  return matchLine;
}

function getWebviewContent(unlocalizedTexts, config) {
  const i18nFunctionName = config.get("i18nFunctionName", "i18next.t");
  
  // Separate known and possible occurrences
  const knownOccurrences = unlocalizedTexts.filter(item => item.line !== -1);
  const possibleOccurrences = unlocalizedTexts.filter(item => item.line === -1);
  
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
      ${knownOccurrences.map((item, index) => `
        <div class="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition duration-300 ease-in-out cursor-pointer" onclick="jumpToLine(${item.line})">
          <div class="flex justify-between items-center mb-2">
            <strong class="text-lg text-cyan-600">${index + 1}. Line ${item.line + 1}</strong>
          </div>
          <p class="text-gray-700">${item.text}</p>
        </div>
      `).join('')}
      
      ${possibleOccurrences.length > 0 ? `
        <h3 class="text-xl font-semibold mt-8 mb-4 text-gray-700">Possible Occurrences</h3>
        ${possibleOccurrences.map((item, index) => `
          <div class="bg-gray-200 rounded-lg shadow-md p-4 hover:shadow-lg transition duration-300 ease-in-out">
            <div class="flex justify-between items-center mb-2">
              <strong class="text-lg text-gray-600">Possible ${index + 1}</strong>
            </div>
            <p class="text-gray-700">${item.text}</p>
          </div>
        `).join('')}
      ` : ''}
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      function jumpToLine(line) {
        vscode.postMessage({
          command: 'jumpToLine',
          line: line
        });
      }
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

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
