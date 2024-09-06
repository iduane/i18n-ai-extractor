jest.mock("vscode", () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key, defaultValue) => {
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
        };
        return properties["i18nAiExtractor." + key].default || defaultValue;
      },
    }),
  },
}));

import { scanForUnlocalizedText } from "./scanner";

describe("scanForUnlocalizedText", () => {
  test("detects unlocalized text in JSX", () => {
    const code = `
      const Component = () => (
        <div>
          <h1>Hello, World!</h1>
          <p>This is some unlocalized text.</p>
        </div>
      );
    `;
    const result = scanForUnlocalizedText(code, "jsx");
    expect(result).toContainEqual(
      expect.objectContaining({ text: "Hello, World!" })
    );
    expect(result).toContainEqual(
      expect.objectContaining({ text: "This is some unlocalized text." })
    );
  });
  test("ignores comments", () => {
    const code = `
      // This is a comment
      /* This is a multi-line comment
         with some text */ "This should be detected1";
      const variable = 'This should be detected2';
    `;
    const result = scanForUnlocalizedText(code, "js");
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("This should be detected1");
    expect(result[1].text).toBe("This should be detected2");
  });

  test("detects unlocalized text in object properties", () => {
    const code = `
      const obj = {
        name: 'John Doe',
        label: 'Submit Form',
        age: 30
      };
    `;
    const result = scanForUnlocalizedText(code, "js");
    expect(result).not.toContainEqual(
      expect.objectContaining({ text: "John Doe" })
    );
    expect(result).toContainEqual(
      expect.objectContaining({ text: "Submit Form" })
    );
    expect(result).not.toContainEqual(expect.objectContaining({ text: "30" }));
  });

  test("handles template literals", () => {
    const code = "const message = `Hello, ${name}! Welcome to our site.`;";
    const result = scanForUnlocalizedText(code, "js");
    expect(result).toContainEqual(
      expect.objectContaining({ text: "Hello, ${name}! Welcome to our site." })
    );
  });

  test("ignores import statements", () => {
    const code = `
      import React from 'react';
      import { useTranslation } from 'react-i18next';
    `;
    const result = scanForUnlocalizedText(code, "js");
    expect(result).toHaveLength(0);
  });

  test("detects unlocalized text in React components", () => {
    const code = `
      function Welcome() {
        return <h1>Welcome to our app</h1>;
      }

      const Greeting = () => (
        <div>
          <p>Hello, user!</p>
          <span>Please log in to continue.</span>
        </div>
      );
    `;
    const result = scanForUnlocalizedText(code, "jsx");
    expect(result).toContainEqual(
      expect.objectContaining({ text: "Welcome to our app" })
    );
    expect(result).toContainEqual(
      expect.objectContaining({ text: "Hello, user!" })
    );
    expect(result).toContainEqual(
      expect.objectContaining({ text: "Please log in to continue." })
    );
  });

  test("handles JSX expressions", () => {
    const code = `
      function ConditionalRendering({ isLoggedIn }) {
        return (
          <div>
            {isLoggedIn ? (
              <h1>Welcome back!</h1>
            ) : (
              <h1>Please sign up.</h1>
            )}
          </div>
        );
      }
    `;
    const result = scanForUnlocalizedText(code, "jsx");
    expect(result).toContainEqual(
      expect.objectContaining({ text: "Welcome back!" })
    );
    expect(result).toContainEqual(
      expect.objectContaining({ text: "Please sign up." })
    );
  });

  test("detects unlocalized text in JSX", () => {
    const code = `
      const Component = () => (
        <div>
          <h1>Hello, World!</h1>
          <p>This is some unlocalized text.</p>
        </div>
      );
    `;
    const result = scanForUnlocalizedText(code, "jsx");
    expect(result).toContainEqual(
      expect.objectContaining({ text: "Hello, World!" })
    );
    expect(result).toContainEqual(
      expect.objectContaining({ text: "This is some unlocalized text." })
    );
  });

  test("ignores text inside i18n functions", () => {
    const code = `
      const text = i18next.t('key.to.translate');
    `;
    const result = scanForUnlocalizedText(code, "js");
    expect(result).toHaveLength(0);
  });

  test("ignores comments", () => {
    const code = `
      // This is a comment
      /* This is a multi-line comment
         with some text */ "This should be detected1";
      const variable = 'This should be detected2';
    `;
    const result = scanForUnlocalizedText(code, "js");
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("This should be detected1");
    expect(result[1].text).toBe("This should be detected2");
  });

  test("detects unlocalized text in object properties", () => {
    const code = `
      const obj = {
        name: 'John Doe',
        label: 'Submit Form',
        age: 30
      };
    `;
    const result = scanForUnlocalizedText(code, "js");
    expect(result).not.toContainEqual(
      expect.objectContaining({ text: "John Doe" })
    );
    expect(result).toContainEqual(
      expect.objectContaining({ text: "Submit Form" })
    );
    expect(result).not.toContainEqual(expect.objectContaining({ text: "30" }));
  });

  test("ignores HTML tags", () => {
    const code = `
      <div>
        <span>This should be detected</span>
      </div>
    `;
    const result = scanForUnlocalizedText(code, "html");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("This should be detected");
  });

  test("handles template literals", () => {
    const code = "const message = `Hello, ${name}! Welcome to our site.`;";
    const result = scanForUnlocalizedText(code, "js");
    expect(result).toContainEqual(
      expect.objectContaining({ text: "Hello, ${name}! Welcome to our site." })
    );
  });

  test("ignores import statements", () => {
    const code = `
      import React from 'react';
      import { useTranslation } from 'react-i18next';
    `;
    const result = scanForUnlocalizedText(code, "js");
    expect(result).toHaveLength(0);
  });

  test("ignores React component names and attribute names", () => {
    const code = `
      <Button onClick={handleClick}>
        Click me
      </Button>
    `;
    const result = scanForUnlocalizedText(code, "jsx");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Click me");
  });

  test("detects unlocalized text in complex JSX button", () => {
    const code = `
      <button
        type="button"
        className={classNames(
          'inline-block mx-1 mt-3 px-4 py-1 text-center text-md text-gray-700 dark:text-white rounded-lg bg-transparent border-1 border-solid border-primary'
        )}
        disabled={selectedValue == null}
        onClick={(e) => {
          if (selectedValue) {
            const newValue = value.filter((v) => v !== selectedValue);
            setValue(newValue);
            onChange(newValue);
            setSelectedValue(null);
          }
        }}
      >
        Remove
      </button>
    `;
    const result = scanForUnlocalizedText(code, "jsx");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        text: "Remove",
      })
    );
  });
});
