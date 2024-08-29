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

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
