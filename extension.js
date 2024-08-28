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
        vscode.window.showErrorMessage("No text selected.");
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
    'Suggest a concise i18n key for this text: "{{text}}", just a key, no dotted combination paths, as simple as possible, use underline for multiple word keys, no explanation, no nothing, just the key.';
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

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
