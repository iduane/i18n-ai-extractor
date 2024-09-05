import * as vscode from "vscode";

// Prompt:
// with given use cases, please help to write a scanner to detect unlocalized text
// [
//   {
//     text: `{
//       name: 'addFeedGroup',
//       label: 'Add Feed Group',
//     }`,
//     expected: "Add Feed Group",
//     fileType: "jsx",
//   },
// ]

export function scanForUnlocalizedText(code, fileType) {
  const unlocalizedTexts = [];
  const stringRegex = /'([^']+)'|"([^"]+)"/g;
  const lines = code.split("\n");

  let inMultiLineComments = false;
  let cumulativeLength = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (inMultiLineComments && line.trim().startsWith("*/")) {
      inMultiLineComments = false;
    }
    if (inMultiLineComments) {
      cumulativeLength += line.length + 1;
      continue;
    }
    if (line.trim().startsWith("//")) {
      cumulativeLength += line.length + 1;
      continue;
    }
    if (line.startsWith("/*")) {
      inMultiLineComments = true;
      cumulativeLength += line.length + 1;
      continue;
    }
    let match;
    stringRegex.lastIndex = 0; // Reset lastIndex to 0 for each line
    while ((match = stringRegex.exec(line)) !== null) {
      const text = match[1] || match[2];
      const originalIndex = cumulativeLength + match.index;

      const lineNumber = lineIndex + 1; // Simplified line number calculation
      const currentLine = line;
      const previousLine = lineIndex > 0 ? lines[lineIndex - 1] : null;
      const nextLine =
        lineIndex < lines.length - 1 ? lines[lineIndex + 1] : null;

      if (
        shouldBeLocalized(text, currentLine, fileType) &&
        !isInsideComplexProp(code, text, originalIndex) &&
        !isNameOrIdField(code, text, originalIndex) &&
        !isRequireOrImport(currentLine, previousLine) &&
        !isEqualExpression(code, text, originalIndex) &&
        !isInsideI18next(currentLine, previousLine) &&
        !isFunctionParam(code, text, originalIndex) &&
        !isCamelCase(text)
      ) {
        unlocalizedTexts.push({
          text,
          index: originalIndex,
          line: lineNumber,
          currentLineText: currentLine.trim(),
          previousLineText: previousLine ? previousLine.trim() : null,
          nextLineText: nextLine ? nextLine.trim() : null,
        });
      }
    }
    cumulativeLength += line.length + 1;
  }

  return unlocalizedTexts;
}

// Update these helper functions
function shouldBeLocalized(text, currentLine, fileType) {
  const config = vscode.workspace.getConfiguration("i18nAiExtractor");
  const ignoredProps = config.get("ignoredProps", []);
  const ignoredValuePrefixes = config.get("ignoredValuePrefixes", []);

  // Ignore text that appears after specified JSX attributes
  const propRegex = new RegExp(
    `\\b(\.?${ignoredProps.join("|")})\\s*(=|:)\\s*["']`
  );
  if (propRegex.test(currentLine)) {
    return false;
  }

  // Ignore text that appears after custom ignored value prefixes
  const valuePrefixRegex = new RegExp(`\\b(${ignoredValuePrefixes.join("|")})`);
  if (valuePrefixRegex.test(currentLine)) {
    return false;
  }

  // Ignore JSX attributes like className, width, etc.
  if (
    /^(className|style|width|height|id|src|alt|href|type|placeholder|value)$/.test(
      text
    )
  ) {
    return false;
  }

  // Ignore Tailwind and Bootstrap class names
  if (
    /^(bg-|text-|border-|p-|m-|flex|grid|col-|row-|sm:|md:|lg:|xl:|2xl:)/.test(
      text
    )
  ) {
    return false;
  }

  // Ignore CSS values like "100px", "2em", "#fff", etc.
  if (/^(\d+(\.\d+)?(px|em|rem|vh|vw|%)|#[0-9A-Fa-f]{3,6})$/.test(text)) {
    return false;
  }

  return (
    text.length > 1 &&
    text !== '""' &&
    text !== "''" &&
    /[A-Za-z]/.test(text) && // Contains at least one letter
    !/^\d+$/.test(text) && // Is not just a number
    !/^[A-Z0-9_]+$/.test(text) // Is not an all-caps constant
  );
}

function isRequireOrImport(line, previousLine) {
  // Check for single-line import/require
  if (/^\s*(import|require|export)/.test(line)) {
    return true;
  }

  // Check for multi-line import
  if (/^\s*import\s*{/.test(previousLine) || /^\s*}\s*from/.test(line)) {
    return true;
  }

  // Check for multi-line require
  if (/^\s*const\s*{/.test(previousLine) && /^\s*}\s*=\s*require/.test(line)) {
    return true;
  }

  return false;
}

function isEqualExpression(code, text, originalIndex) {
  const beforeText = code.slice(Math.max(0, originalIndex - 50), originalIndex);
  const afterText = code.slice(
    originalIndex + text.length,
    originalIndex + text.length + 50
  );

  // Pattern for equality/inequality comparisons
  const equalityPattern = /(\w+|\))\s*(===?|!==?)\s*$/;
  const afterEqualityPattern = /^\s*(===?|!==?)\s*(\w+|\()/;

  return (
    equalityPattern.test(beforeText) || afterEqualityPattern.test(afterText)
  );
}

function isInsideI18next(currentLine, previousLine) {
  const config = vscode.workspace.getConfiguration("i18nAiExtractor");
  const i18nDetectPrefixNames = config
    .get("i18nDetectPrefixNames", "i18n.t,t")
    .split(",")
    .map((name) => name.trim());
  const i18nRegex = new RegExp(
    `(${i18nDetectPrefixNames.join("|")})\\s*\\(\\s*['"]`
  );

  return (
    (previousLine &&
      i18nDetectPrefixNames.some((name) =>
        previousLine.trim().endsWith(`${name}(`)
      )) ||
    i18nRegex.test(currentLine)
  );
}

function isInsideComplexProp(code, text, index) {
  // Check if the text is inside a complex prop like below, it could be multiple lines expression
  // className={classNames(
  //   'h-full',
  //   'pl-4',
  //   'pr-4',
  //   'pt-3',
  //   model.type == 'feed' ? 'w-2/5' : 'w-1/2'
  // )}

  const beforeText = code.slice(0, index);
  const afterText = code.slice(index + text.length);

  // Check if there's an opening brace before the text
  const lastOpenBrace = beforeText.lastIndexOf("{");
  if (lastOpenBrace === -1) return false;

  // Check if there's a closing brace after the text
  const nextCloseBrace = afterText.indexOf("}");
  if (nextCloseBrace === -1) return false;

  // Check if there's a class, className, or style prop before the opening brace
  const propRegex = /\b(class|className|style)\s*=\s*$/;
  const textBeforeBrace = beforeText.slice(0, lastOpenBrace);
  if (!propRegex.test(textBeforeBrace)) return false;

  // Check if there are parentheses, object literals, or other function-like structures
  const complexPropRegex = /(\w+\s*\(|\?|:|\+|\-|\*|\/|{\s*\w+\s*:)/;
  const textBetweenBraces =
    beforeText.slice(lastOpenBrace + 1) +
    text +
    afterText.slice(0, nextCloseBrace);
  return complexPropRegex.test(textBetweenBraces);
}

function isNameOrIdField(code, text, index) {
  const beforeText = code.slice(0, index);
  const afterText = code.slice(index + text.length);

  // Check if the text is inside a name, id, or field property
  const keyFieldRegex = /\b(name|id|field)\s*:\s*$/;
  if (keyFieldRegex.test(beforeText)) {
    return true;
  }

  // Check if there's a label property in the same object
  const objectStart = beforeText.lastIndexOf("{");
  if (objectStart !== -1) {
    const objectContent =
      beforeText.slice(objectStart) + text + afterText.split("}")[0];
    if (/\blabel\s*:/.test(objectContent)) {
      // If label is present, check if the current text is for name, id, or field
      return /\b(name|id|field)\s*:\s*(['"])/.test(beforeText);
    }
  }

  return false;
}

function isFunctionParam(code, text, index) {
  const config = vscode.workspace.getConfiguration("i18nAiExtractor");
  const ignoredFunctions = config.get("ignoredFunctions", ["sampleFunction"]);

  const beforeText = code.slice(0, index);
  const afterText = code.slice(index + text.length);

  // Check if the text is inside a function parameter
  const functionParamRegex = new RegExp(
    `\\b(${ignoredFunctions.join("|")})\\s*\\(`
  );

  // Look for the last occurrence of a function call before the text
  const lastFunctionCall = beforeText
    .split("\n")
    .reverse()
    .find((line) => functionParamRegex.test(line));

  if (lastFunctionCall) {
    // Check if there's an unmatched opening parenthesis after the function call
    const openParenCount = (lastFunctionCall.match(/\(/g) || []).length;
    const closeParenCount = (lastFunctionCall.match(/\)/g) || []).length;

    if (openParenCount > closeParenCount) {
      return true;
    }
  }

  return false;
}

function isCamelCase(text) {
  const config = vscode.workspace.getConfiguration("i18nAiExtractor");
  const ignoreCamelCase = config.get("ignoreCamelCase", false);

  if (!ignoreCamelCase) {
    return false;
  }

  return /^[a-z][a-zA-Z0-9]*$/.test(text);
}

// Example usage:
const testCode = `{
  name: 'addFeedGroup',
  label: 'Add Feed Group',
  description: "This is a longer description that should be localized",
  count: 42
}`;

const result = scanForUnlocalizedText(testCode, "jsx");
console.log(result);
