import * as vscode from "vscode";

export const COMMANDS = {
  JUMP_TO_FILE_LINE: "jumpToFileLine",
};

export function onCommand() {
  return (message) => {
    switch (message.command) {
      case COMMANDS.JUMP_TO_FILE_LINE:
        jumpToFileLine(message);
        return;
    }
  };
}

function jumpToFileLine(message) {
  const filePath = message.filePath;
  const uri = vscode.Uri.file(filePath);
  vscode.workspace.openTextDocument(uri).then((doc) => {
    vscode.window
      .showTextDocument(doc, { viewColumn: vscode.ViewColumn.One })
      .then((editor) => {
        const position = new vscode.Position(message.line - 1, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position));
      });
  });
  return;
}
