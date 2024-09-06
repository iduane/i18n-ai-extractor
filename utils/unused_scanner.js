export function scanForInuseI18nKeys(code, fileType) {
  const keys = new Set();

  // Regular expressions for different patterns
  const patterns = [
    /(i18next\.t)\(\s*(['"`])([\w\-_\.]+)\s*(\2|\)|,|\$\{)/g,
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

export function collectAllI18nKeys() {
  // plural keys
}

export function revisitI18nKeyPresenceInSource() {
  // double check by search the key in source file
}
