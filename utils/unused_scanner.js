import path from "path";
import * as vscode from "vscode";

export function scanForInuseI18nKeys({ code, fileType }) {
  const keys = new Set();

  // Regular expressions for different patterns
  const config = vscode.workspace.getConfiguration("i18nAiExtractor");
  const i18nDetectPrefixNames = config
    .get("i18nDetectPrefixNames", "i18n.t,t")
    .split(",")
    .map((name) => name.trim());

  const i18nFunctionPatterns = i18nDetectPrefixNames.map(
    (prefix) =>
      new RegExp(
        `(${prefix.replace(
          ".",
          "\\."
        )}\\s*\\()\\s*(['"\`])([\\w\\-_\\.]+)\\s*(\\2|\\)|,|\\$\\{)`,
        "g"
      )
  );

  const patterns = [
    ...i18nFunctionPatterns,
    /(data-i18n)="([^"]+)"/g,
    /{{(t) ['"]([^'"]+)['"]}}/g,
    /'(i18n:)([^']+)'/g,
    /'(i18n:)([^']+)'\s*\+\s*([^']+)/g,
    /["'\w-]+(Key|key|i18n)["']?\s*[=:]\s*(['"`])([^'"`]+)\2/g,
  ];

  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      // Update key extraction logic
      let key = match[3] || match[2] || match[1];

      if (key.includes("i18n:")) {
        key = key.replace("i18n:", "");
      }

      // Handle multiple keys in data-i18n attribute
      if (key.includes(";")) {
        key.split(";").forEach((subKey) => {
          const cleanKey = subKey.replace(/^\[.*?\]/, "").trim();
          keys.add(cleanKey);
        });
      } else {
        // Handle single key
        const cleanKey = key.replace(/^\[.*?\]/, "").trim();
        // Simplify dynamic key handling
        const keyParts = cleanKey.split(".");
        const wildcardKey = keyParts
          .map((part) =>
            part.includes("${") || part.includes("}") || part === ""
              ? "*"
              : part
          )
          .join(".")
          .replace(/(\.\*)+$/, ".*");
        keys.add(wildcardKey);
      }
    }
  });

  // Additional check for custom attributes
  const customAttrPattern =
    /[''](label-i18n|title-i18n)["']\s*:\s*['']([^"']+)['']/g;
  let customAttrMatch;
  while ((customAttrMatch = customAttrPattern.exec(code)) !== null) {
    keys.add(customAttrMatch[2]);
  }

  return Array.from(keys);
}

export const collectAllI18nKeys = {
  bind(context, config) {
    return ({ code, filePath, fileType, fileRelativePath }) => {
      const localeFolder = config.get("localeResourceFolder", "locale");
      const relativePath = path.relative(localeFolder, fileRelativePath);
      const uniqueIdentifier = relativePath
        .replace(/\.\w+$/, "")
        .replace(/[\/\\]/g, ".");
      const keysWithPaths = new Map();
      let locales;
      try {
        locales = JSON.parse(code);
      } catch (e) {
        console.error("Invalid JSON code", e);
      }

      if (locales) {
        extractKeys(locales, uniqueIdentifier, keysWithPaths, filePath);
      }
      // Convert the Map to an array of objects
      return Array.from(keysWithPaths, ([key, filePath]) => ({
        key,
        filePath,
      }));
    };
  },
};

function extractKeys(obj, prefix = "", keysWithPaths, filePath) {
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null) {
      extractKeys(value, newKey, keysWithPaths, filePath);
    } else {
      keysWithPaths.set(newKey, filePath);
    }
  }
}

export const revisitI18nKeyPresenceInSource = {
  bind(key) {
    return ({ code }) => {
      return code.includes(key);
    };
  },
};
