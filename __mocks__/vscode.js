module.exports = {
  workspace: {
    getConfiguration: () => ({
      get: (key, defaultValue) => {
        debugger;
        const properties = {
          "i18nAiExtractor.localePath": {
            type: "string",
            default: "",
            description:
              "Path to your locale file (relative to workspace root)",
          },
          "i18nAiExtractor.openAIApiKey": {
            type: "string",
            default: "",
            description: "Your OpenAI API key",
          },
          "i18nAiExtractor.openAIBasePath": {
            type: "string",
            default: "https://api.openai.com/v1",
            description: "Base path for OpenAI API",
          },
          "i18nAiExtractor.chatTemplate": {
            type: "string",
            default: "",
            description:
              "Custom template for OpenAI chat prompt. Use {{text}} as a placeholder for the selected text.",
          },
          "i18nAiExtractor.unlocalizedTextPrompt": {
            type: "string",
            default: "",
            description:
              "Custom prompt for unlocalized text scanning. Use {{text}} as a placeholder for the scanned text.",
            editPresentation: "multilineText",
          },
          "i18nAiExtractor.i18nFunctionName": {
            type: "string",
            default: "i18next.t",
            description: "Name of the i18n function to use",
          },
          "i18nAiExtractor.i18nDetectPrefixNames": {
            type: "string",
            default: "i18next.t",
            description:
              "Name list of the i18n key usages, separated by commas",
          },
          "i18nAiExtractor.maxRequestSize": {
            type: "number",
            default: 20000,
            description:
              "Maximum size of the text to be sent to OpenAI for localization",
          },
          "i18nAiExtractor.ignoredProps": {
            type: "array",
            default: [
              "style",
              "width",
              "minWidth",
              "maxWidth",
              "height",
              "minHeight",
              "maxHeight",
              "id",
              "src",
              "alt",
              "href",
              "d",
              "transform",
              "xmlns",
              "fill",
              "type",
              "prop",
              "className",
              "class",
              "size",
              "useState",
              "customProp1",
              "customProp2",
            ],
            description:
              "List of properties to ignore when scanning for unlocalized text",
          },
          "i18nAiExtractor.scanFileExtensions": {
            type: "array",
            default: [
              "js",
              "jsx",
              "html",
              "vue",
              "mjs",
              "cj",
              "ts",
              "tsx",
              "json",
              "handlebars",
            ],
            description: "List of file extensions to scan for unlocalized text",
          },
          "i18nAiExtractor.scanSkipFileExtensions": {
            type: "array",
            default: [
              "story.js",
              "story.jsx",
              "story.ts",
              "story.tsx",
              "stories.js",
              "stories.jsx",
              "stories.ts",
              "stories.tsx",
              "test.js",
              "test.jsx",
              "test.ts",
              "test.tsx",
              "spec.js",
              "spec.jsx",
              "spec.ts",
              "spec.tsx",
            ],
            description:
              "List of file extensions to skip when scanning for unlocalized text",
          },
          "i18nAiExtractor.scanSkipFolders": {
            type: "array",
            default: [
              "node_modules",
              "dist",
              "build",
              "public",
              "static",
              "assets",
              "images",
              "__tests__",
              "__snapshots__",
              "coverage",
              "__mocks__",
            ],
            description:
              "List of folders to skip when scanning for unlocalized text",
          },
          "i18nAiExtractor.ignoredValuePrefixes": {
            type: "array",
            default: [
              "bg-",
              "btn-",
              "text-",
              "border-",
              "p-",
              "m-",
              "flex",
              "grid",
              "col-",
              "row-",
              "sm:",
              "md:",
              "lg:",
              "xl:",
              "2xl:",
              "var\\(--",
              "theme\\(",
              "i18n:",
            ],
            description:
              "List of value prefixes to ignore when scanning for unlocalized text",
          },
          "i18nAiExtractor.ignoredFunctions": {
            type: "array",
            default: [
              "classNames",
              "cn",
              "clsx",
              "useState",
              "log",
              "log.error",
              "log.warn",
              "log.info",
              "log.debug",
              "log.dev.error",
              "log.dev.warn",
              "log.dev.info",
              "log.dev.debug",
              "console.log",
              "console.error",
              "console.warn",
              "console.info",
              "console.debug",
              "notify",
              "find",
              "css",
              "\\.on",
              "\\.off",
            ],
            description:
              "List of function names to ignore when scanning for unlocalized text",
          },
          "i18nAiExtractor.ignoreCamelCase": {
            type: "boolean",
            default: true,
            description:
              "Ignore camel case text when scanning for unlocalized text",
          },
          "i18nAiExtractor.ignoreSnakeCase": {
            type: "boolean",
            default: true,
            description:
              "Ignore snake case text when scanning for unlocalized text",
          },
          "i18nAiExtractor.ignoreDotExpression": {
            type: "boolean",
            default: true,
            description:
              "Ignore dot expression text when scanning for unlocalized text",
          },
          "i18nAiExtractor.ignoreHTMLText": {
            type: "boolean",
            default: true,
            description: "Ignore HTML text when scanning for unlocalized text",
          },
        };
        return properties["i18nAiExtractor." + key].default || defaultValue;
      },
    }),
  },
};
