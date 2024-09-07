import { readFileSync } from "fs";
import { promises as fs } from "fs";
import path from "path";
import vscode from "vscode";

export async function scanDirectory(
  dirPath,
  config,
  executor,
  resultReducer = (a) => a
) {
  const results = [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      results.push(
        ...(await scanDirectory(fullPath, config, executor, resultReducer))
      );
    } else if (entry.isFile()) {
      const fileResult = await scanSingleFile(fullPath, config, executor);
      results.push(fileResult);
    }
  }

  return resultReducer(results);
}

export async function scanSingleFile(filePath, config, executor) {
  const skipFolders = config.get("scanSkipFolders", []);
  const skipFoldersRegex = new RegExp(skipFolders.join("|"));
  if (skipFoldersRegex.test(filePath)) {
    return null;
  }
  // only scan specific file extensions; and make file extension case configurable
  const fileExt = path.basename(filePath).split(".").slice(1).join(".");
  const allowedExtensions = config.get("scanFileExtensions", []);
  if (!allowedExtensions.includes(fileExt)) {
    return null;
  }
  const skipExtensions = config.get("scanSkipFileExtensions", []);
  if (skipExtensions.includes(fileExt)) {
    return null;
  }
  const code = readFileSync(filePath, "utf8");
  const fileRelativePath = path.relative(
    vscode.workspace.workspaceFolders[0].uri.fsPath,
    filePath
  );
  const result = await executor({
    code,
    fileType: fileExt,
    fileRelativePath,
    filePath,
  });

  return result;
}
