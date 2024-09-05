import * as vscode from "vscode";

let outputChannel;

export function createOutputChannel() {
  outputChannel =
    outputChannel || vscode.window.createOutputChannel("i18n AI Extractor");

  return outputChannel;
}
