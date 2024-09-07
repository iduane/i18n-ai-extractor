import { scanForUnlocalizedText } from "./unlocalized_scanner";

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
