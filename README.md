# I18n AI Extractor

This VS Code extension utilizes AI to extract locale keys from your code, specifically designed for projects with hard-coded strings looking to transition to i18n. The extension assists in identifying all hard-coded strings and replacing them with locale keys.
It leverages AI to scan the source file, detecting unlocalized text and suggesting corresponding i18n keys for users.

## Features

### 1. Extract Locale

Automatically extract text and generate i18n keys using AI.

- Select text or place your cursor within a sentence.
- Use the command palette (Ctrl+Shift+P) and search for "Extract Locale".
- Alternatively, use the shortcut Ctrl+Alt+Y (Cmd+Alt+Y on Mac).
- The extension will suggest an i18n key and update your locale file.

### 2. Open Locale File

Quickly open your locale file for editing.

- Use the command palette and search for "Open Locale File at I18n Key".
- Alternatively, use the shortcut Ctrl+Alt+T (Cmd+Alt+T on Mac).

### 3. Scan for Unlocalized Text

Identify potentially unlocalized strings in your code.

- Open the file you want to scan.
- Use the command palette and search for "Scan for Unlocalized Text".
- Results will be displayed in a side panel.

### 4. Scan All Unused Keys

Find unused i18n keys in your project.

- Use the command palette and search for "Scan all unused i18n keys".
- The extension will scan your project and list all unused keys.

### 5. Scan All Typos

Identify potential typos in your locale files.

- Use the command palette and search for "Scan all typos in locale files".
- The extension will check your locale files for possible spelling errors.

## Configuration

To configure the extension, go to File > Preferences > Settings and search for "I18n AI Extractor".

Key settings include:

- `i18nAiExtractor.localePath`: Path to your locale file (relative to workspace root).
- `i18nAiExtractor.openAIApiKey`: Your OpenAI API key for AI-powered key suggestions.
- `i18nAiExtractor.openAIBasePath`: Base path for OpenAI API (default: "https://api.openai.com/v1").
- `i18nAiExtractor.chatTemplate`: Custom template for OpenAI chat prompt. Use {{text}} as a placeholder for the selected text.
- `i18nAiExtractor.unlocalizedTextPrompt`: Custom prompt for unlocalized text scanning. Use {{text}} as a placeholder for the scanned text.
- `i18nAiExtractor.i18nFunctionName`: The name of your i18n function (default: "i18next.t").
- `i18nAiExtractor.maxRequestSize`: Maximum size of the text to be sent to OpenAI for localization (default: 20000).
- `i18nAiExtractor.scanFolderForUnused`: Folder to scan for unused text (default: "src").
- `i18nAiExtractor.localeResourceFolder`: Folder containing locale resources (default: "locale").

## Usage Tips

1. **Extracting Locale**:

   - For best results, select complete sentences or phrases.
   - You can modify the suggested key before confirming.

2. **Scanning for Unlocalized Text**:

   - Review the results carefully, as not all string literals may need translation.
   - Click on the line numbers in the results to jump to the corresponding location in your code.

3. **OpenAI Integration**:

   - To use AI-powered key suggestions, make sure to set your OpenAI API key in the extension settings.
   - You can customize the AI prompt in the settings to fit your project's naming conventions.

4. **Scanning for Unused Keys**:

   - Use this feature periodically to keep your locale files clean and efficient.
   - Consider removing or commenting out unused keys to maintain a tidy codebase.

5. **Checking for Typos**:
   - Run the typo scan before releases to ensure high-quality translations.
   - Verify suggested typos, as some technical terms or proper nouns might be flagged incorrectly.

## Troubleshooting

- If you encounter any issues, check the Output panel (View > Output) and select "I18n AI Extractor" from the dropdown for detailed logs.
- Ensure your locale file path is correctly set in the extension settings.
- If AI key suggestions aren't working, verify your OpenAI API key and internet connection.

## Feedback and Contributions

We welcome your feedback and contributions! Please visit our [GitHub repository](https://github.com/iduane/i18n-ai-extractor) to:

- Report issues
- Suggest new features
- Contribute to the codebase

## TODO

1. Support i18next's locale key composition options: basenameAsNamespace/relativePathAsNamespace

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
