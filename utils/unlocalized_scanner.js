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
  const stringRegex = /'([^']+)'|"([^"]+)"|`([^`]+)`/g;

  const lines = code.split("\n");

  let inMultiLineComments = false;
  let cumulativeLength = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    let lineMatchStartIndex = 0;
    if (inMultiLineComments && line.trim().indexOf("*/") !== -1) {
      lineMatchStartIndex = line.indexOf("*/") + 2;
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
    if (line.trim().startsWith("/*")) {
      inMultiLineComments = true;
      cumulativeLength += line.length + 1;
      continue;
    }
    let match;
    stringRegex.lastIndex = lineMatchStartIndex; // Reset lastIndex to 0 for each line

    while ((match = stringRegex.exec(line)) !== null) {
      const text = match[1] || match[2] || match[3];
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
        !isObjectProperty(code, text, originalIndex) &&
        !(
          (fileType === "handlebars" || fileType === "hbs") &&
          isHandlebarsI18n(code, text, originalIndex)
        ) &&
        !(
          (fileType === "html" || fileType === "htm") &&
          isHTMLI18n(code, text, originalIndex)
        ) &&
        !isIgnoredText(text)
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

    let match2;
    const tagChildTextRegex = />([^<>]+)</g;

    tagChildTextRegex.lastIndex = lineMatchStartIndex;
    while ((match2 = tagChildTextRegex.exec(line)) !== null) {
      const text = match2[1];
      const originalIndex = cumulativeLength + match2.index;
      const lineNumber = lineIndex + 1; // Simplified line number calculation
      const currentLine = line;
      const previousLine = lineIndex > 0 ? lines[lineIndex - 1] : null;
      const nextLine =
        lineIndex < lines.length - 1 ? lines[lineIndex + 1] : null;
      if (text.startsWith("{") && text.endsWith("}")) {
        continue;
      }
      unlocalizedTexts.push({
        text,
        index: originalIndex,
        line: lineNumber,
        currentLineText: currentLine.trim(),
        previousLineText: previousLine ? previousLine.trim() : null,
        nextLineText: nextLine ? nextLine.trim() : null,
      });
    }

    cumulativeLength += line.length + 1;
  }

  processMultipleLines(code, unlocalizedTexts, fileType);
  return unlocalizedTexts;
}

// Update these helper functions
function shouldBeLocalized(text, currentLine) {
  if (
    [
      "\\n",
      "<tr>",
      "<td>",
      "<th>",
      "<span>",
      "<div>",
      "<p>",
      "<a>",
      "<button>",
      "<input>",
      "<textarea>",
      "<label>",
      "<select>",
      "<option>",
      "<img>",
      "<table>",
      "<b>",
      "<h1>",
      "<h2>",
      "<h3>",
      "<h4>",
      "<h5>",
      "<h6>",
      "</h1>",
      "</h2>",
      "</h3>",
      "</h4>",
      "</h5>",
      "</h6>",
      "</b>",
      "</span>",
      "</div>",
      "</p>",
      "</a>",
      "</button>",
      "</input>",
      "</textarea>",
      "</label>",
      "</select>",
      "</option>",
      "</img>",
      "</tr>",
      "</td>",
      "</th>",
      "</table>",
    ].includes(text)
  ) {
    return false;
  }
  const config = vscode.workspace.getConfiguration("i18nAiExtractor");
  const ignoredProps = config.get("ignoredProps", []);
  const ignoredValuePrefixes = config.get("ignoredValuePrefixes", []);

  // Ignore text that appears after specified JSX attributes
  if (ignoredProps.length > 0) {
    const propRegex = new RegExp(
      `\\b(\.?${ignoredProps.join("|")})\\s*(=|:)\\s*(["'])`,
      "g"
    );
    let propMath;
    while ((propMath = propRegex.exec(currentLine)) !== null) {
      const quote = propMath[3];
      const propValue = currentLine.slice(propMath.index + propMath[0].length);
      if (propValue.startsWith(text + quote)) {
        return false;
      }
    }
  }

  // Ignore text that appears after custom ignored value prefixes
  if (ignoredValuePrefixes.length > 0) {
    const valuePrefixRegex = new RegExp(`^(${ignoredValuePrefixes.join("|")})`);
    if (valuePrefixRegex.test(text)) {
      return false;
    }
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
  const beforeText = code.slice(Math.max(0, index - 150), index + 1);
  const afterText = code.slice(index + text.length);

  // Check if the text is inside a name, id, or field property
  const keyFieldRegex = /\b(name|id|field|value)\s*:\s*["']$/;
  if (!keyFieldRegex.test(beforeText)) {
    return false;
  }

  // Check if there's a label property in the same object
  const objectStart = beforeText.lastIndexOf("{");
  if (objectStart !== -1) {
    const objectContent =
      beforeText.slice(objectStart) + text + afterText.split("}")[0];
    if (/\blabel\s*:/m.test(objectContent)) {
      return true;
    }
  }

  return false;
}

function isFunctionParam(code, text, index) {
  const config = vscode.workspace.getConfiguration("i18nAiExtractor");
  const ignoredFunctions = config.get("ignoredFunctions", ["sampleFunction"]);

  const beforeText = code.slice(Math.max(0, index - 50), index);

  // Check if the text is inside a function parameter
  const functionParamRegex = new RegExp(
    `\\b(${ignoredFunctions.join("|")})\\s*\\($`
  );

  if (functionParamRegex.test(beforeText)) {
    return true;
  }

  return false;
}

function isObjectProperty(code, text, index) {
  const beforeText = code.slice(Math.max(0, index - 50), index + 1);
  const afterText = code.slice(
    index + text.length + 1,
    index + text.length + 5
  );

  // Check for bracket notation access
  const bracketNotationRegex = /\b(\w+)\[\s*['"][\w.\-]+['"]\s*\]/;

  return bracketNotationRegex.test(beforeText + text + afterText);
}

function isHandlebarsI18n(code, text, index) {
  const beforeText = code.slice(0, index);
  const afterText = code.slice(index + text.length);

  // Check if the text is inside a handlebars template
  const handlebarsRegex = /\{\{\s*t\s+['"]|['"].*\}\}/;
  return handlebarsRegex.test(beforeText) || handlebarsRegex.test(afterText);
}

function isHTMLI18n(code, text, index) {
  const aroundText = code.slice(
    Math.max(0, index - 50),
    index + text.length + 2
  );

  // Check for data-i18n attribute with various patterns
  const aroundTextRegex = /data-i18n\s*=\s*["']([^"']+)["']/gm;

  let i18nMatch = aroundTextRegex.exec(aroundText);

  if (i18nMatch) {
    const i18nValue = i18nMatch[1];
    // Check for all three cases
    const i18nParts = i18nValue.split(";");
    for (const part of i18nParts) {
      if (part.includes("[")) {
        // Case 1 and 3: [title]component.networkGraph.appMap.resetZoom
        const keyPart = part.split("]")[1];
        if (keyPart && keyPart.trim() === text.trim().replace(/\[\w+\]/, "")) {
          return true;
        }
      } else {
        // Case 2: component.networkGraph.appMap.resetZoom
        if (part.trim() === text.trim()) {
          return true;
        }
      }
    }
  }

  return false;
}

function isIgnoredText(text) {
  return (
    isCamelCase(text) ||
    isSnakeCase(text) ||
    isDotExpression(text) ||
    isNumber(text) ||
    isPath(text) ||
    isColor(text) ||
    isHTMLCode(text)
  );
}

function isCamelCase(text) {
  const config = vscode.workspace.getConfiguration("i18nAiExtractor");
  const ignoreCamelCase = config.get("ignoreCamelCase", false);

  if (!ignoreCamelCase) {
    return false;
  }

  return /^[a-z][a-zA-Z0-9]*$/.test(text);
}

function isSnakeCase(text) {
  const config = vscode.workspace.getConfiguration("i18nAiExtractor");
  const ignoreSnakeCase = config.get("ignoreSnakeCase", false);

  if (!ignoreSnakeCase) {
    return false;
  }

  return /^[a-z]+_[a-z]+$/.test(text);
}

function isDotExpression(text) {
  const config = vscode.workspace.getConfiguration("i18nAiExtractor");
  const ignoreDotExpression = config.get("ignoreDotExpression", false);

  if (!ignoreDotExpression) {
    return false;
  }

  return text.startsWith(".") && text.length > 1;
}

function isNumber(text) {
  // trim unit like px, em, %, etc.
  const unitRegex =
    /px|em|%|pt|in|cm|mm|ex|pc|vh|vw|vmin|vmax|deg|rad|grad|turn|ms|[a-zA-Z]/;
  const trimmedText = text.replace(unitRegex, "");
  // Matches integers, decimals, and scientific notation
  return /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(trimmedText);
}

function isPath(text) {
  return /^\/[^/]+\/.*$/.test(text);
}

function isColor(text) {
  return /^#[0-9A-Fa-f]{6}$/.test(text);
}

function isHTMLCode(text) {
  const config = vscode.workspace.getConfiguration("i18nAiExtractor");
  const ignoreHTMLText = config.get("ignoreHTMLText", false);

  if (!ignoreHTMLText) {
    return false;
  }

  const headMatch = /^<(\w+)/.exec(text);
  const tailMatch = /<\/(\w+)>/.exec(text);

  if (
    (headMatch && tailMatch && headMatch[1] === tailMatch[1]) ||
    text.endsWith("/>")
  ) {
    return true;
  }
}

function processMultipleLines(code, unlocalizedTexts, fileType) {
  if (["jsx", "js", "html"].includes(fileType)) {
    // Add a new regex to match JSX tags and their attributes
    const jsxTagRegex = /<([a-zA-Z]+)\s*([^>]*)>\s*([^<]+)\s*<\/([a-zA-Z]+)>/g;
    let match;
    let matchIndex = 0;
    while ((match = jsxTagRegex.exec(code)) !== null) {
      matchIndex = match.index;
      const [allMatch, openingTag, , childText, closingTag] = match;
      let text = childText.trim();
      const beforeCloseText = allMatch.substring(
        allMatch.indexOf(">") + 1,
        allMatch.length - closingTag.length - 3
      );
      if (beforeCloseText.indexOf(">") > -1) {
        text = text.substring(beforeCloseText.lastIndexOf(">") + 1);
        matchIndex =
          matchIndex +
            allMatch.indexOf(">") +
            beforeCloseText.lastIndexOf(">") +
            2 +
            ((/^(\s|\r|\n)+/.exec(text) || [""])[0] || {}).length || 0;
        text = text.trim();
      }
      if (
        openingTag === closingTag &&
        text.indexOf("<") < 0 &&
        text.indexOf("</") < 0 &&
        text.indexOf("/>") < 0 &&
        text.indexOf("<") < 0 &&
        text.indexOf("}") < 0 &&
        text.indexOf("{") < 0 &&
        text.indexOf("(") < 0 &&
        text.indexOf(")") < 0 &&
        text.indexOf("=") < 0 &&
        shouldBeLocalized(text, fileType)
      ) {
        const lineNumber = code.slice(0, matchIndex).split("\n").length;
        const currentLineText = code.split("\n")[lineNumber - 1];
        if (
          !isIgnoredText(text) &&
          !unlocalizedTexts.find((t) => t.text === text)
        ) {
          unlocalizedTexts.push({
            text,
            index: matchIndex,
            line: lineNumber,
            currentLineText,
          });
        }
      }
    }

    const multiLineStringRegex = /`([^`]*)`/g;
    let multiLineStringMatch;
    while ((multiLineStringMatch = multiLineStringRegex.exec(code)) !== null) {
      const text = multiLineStringMatch[1];
      if (shouldBeLocalized(text, fileType)) {
        const lineNumber = code
          .slice(0, multiLineStringMatch.index)
          .split("\n").length;
        const currentLineText = code.split("\n")[lineNumber - 1];
        if (
          !isIgnoredText(text) &&
          !unlocalizedTexts.find((t) => t.text === text)
        ) {
          unlocalizedTexts.push({
            text,
            index: multiLineStringMatch.index,
            line: lineNumber,
            currentLineText,
          });
        }
      }
    }
  }
}
