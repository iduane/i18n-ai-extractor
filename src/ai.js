import * as vscode from "vscode";
import axios from "axios";
import { createOutputChannel } from "./output";

export async function findUnlocalizedText(text, config) {
  const outputChannel = createOutputChannel();
  const openAIApiKey = config.get("openAIApiKey", "");
  const openAIBasePath = config.get(
    "openAIBasePath",
    "https://api.openai.com/v1"
  );
  const unlocalizedTextPrompt = config.get("unlocalizedTextPrompt", "");
  const i18nFunctionName = config.get("i18nFunctionName", "i18next.t");
  const maxRequestSize = config.get("maxRequestSize", 20000);
  const gptModel = config.get("gptModel", "gpt-3.5-turbo"); // Add this line

  if (!openAIApiKey) {
    vscode.window.showErrorMessage(
      "OpenAI API key not configured. Please set i18nAiExtractor.openAIApiKey in settings."
    );
    return [];
  }

  const trimmedText = trimCode(text, maxRequestSize);

  if (trimmedText.length >= maxRequestSize) {
    vscode.window.showWarningMessage(
      `The selected text has over ${maxRequestSize} characters.`
    );
    return;
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

  Return Empty JSON Array if no user-facing English text is found.
  
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
            model: gptModel, // Use the gptModel from config here
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

  // Remove potential code block markers and trim
  const cleanedOutput = aiOutput.replace(/```json\n?|```\n?/g, "").trim();

  // Parse the JSON array from the AI output
  let parsedOutput;

  // Add a try-catch block to handle potential JSON parsing errors
  try {
    parsedOutput = JSON.parse(cleanedOutput);
  } catch (error) {
    console.error("JSON parsing error:", error);
    // Attempt to fix common JSON syntax errors
    const fixedOutput = cleanedOutput
      .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3') // Quote unquoted keys
      .replace(/'/g, '"') // Replace single quotes with double quotes
      .replace(/,\s*}/g, "}") // Remove trailing commas
      .replace(/\n/g, ""); // Remove newlines

    try {
      parsedOutput = JSON.parse(fixedOutput);
      console.log("Fixed JSON:", JSON.stringify(parsedOutput, null, 2));
    } catch (secondError) {
      console.error("Unable to fix JSON:", secondError);
      vscode.window.showErrorMessage(
        "Unable to parse AI output. Please try again. \n\n" + cleanedOutput
      );
      return [];
    }
  }

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
