const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

// sample data of occurrences
// const occurrences = [
//   {
//     filePath: "path/to/file.ts",
//     occurrences: [
//       {
//         line: 1,
//         text: "Hello, world!",
//         command: "copyI18nFunction",
//       },
//     ],
//   },
//   {
//     filePath: "path/to/file2.ts",
//     occurrences: [
//       {
//         line: 1,
//         text: "Hello, world!",
//         command: "extractI18nFunction",
//       },
//     ],
//   },
// ];

export function createWebviewPanel(
  title,
  description,
  fileListOccurrences,
  context,
  onCommand
) {
  const formattedFileListOccurrences = fileListOccurrences.map((file) => {
    return {
      filePath: file.filePath,
      fileName: path.basename(file.filePath),
      occurrences: file.occurrences,
    };
  });

  // Close existing webview if it exists
  if (global.webviewPanel) {
    global.webviewPanel.dispose();
  }

  // Create and show a new webview
  const panel = vscode.window.createWebviewPanel(
    "i18nScannerReport",
    title,
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
    }
  );

  // Store the panel reference globally
  global.webviewPanel = panel;

  // Generate HTML content for the webview
  panel.webview.html = getWebviewContent(
    title,
    description,
    formattedFileListOccurrences,
    context
  );

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(
    async (message) => {
      onCommand(message);
    },
    undefined,
    context.subscriptions
  );

  // Add event listener for panel disposal
  panel.onDidDispose(
    () => {
      global.webviewPanel = undefined;
    },
    null,
    context.subscriptions
  );
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getWebviewContent(title, description, fileListOccurrences, context) {
  const iconContent = fs.readFileSync(
    path.join(context.extensionPath, "OIG4.svg"),
    "utf8"
  );

  const aiDetectedOccurrences = [];
  const possibleDetectedOccurrences = [];

  for (let file of fileListOccurrences) {
    const aiResult = file.occurrences.filter((occ) => occ.ai);
    const possibleResult = file.occurrences.filter((occ) => !occ.ai);
    if (aiResult.length > 0) {
      aiDetectedOccurrences.push({ ...file, occurrences: aiResult });
    }
    if (possibleResult.length > 0) {
      possibleDetectedOccurrences.push({
        ...file,
        occurrences: possibleResult,
      });
    }
  }

  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@shadcn/ui@0.0.1/dist/index.min.css" rel="stylesheet">
  </head>
  <body class="bg-gray-100 text-gray-900 p-6">
    <div class="flex items-center mb-6">
      ${iconContent}
      <h2 class="ml-2 text-2xl font-bold text-gray-800">${title}</h2>
    </div>
    <p class="text-gray-700 mb-4">${description}</p>
    <div class="space-y-4">
      ${aiDetectedOccurrences
        .map(
          (file, fileIndex) => `
        <div class="bg-white shadow-md rounded-lg overflow-hidden">
          <button class="w-full text-left px-4 py-2 bg-cyan-100 hover:bg-cyan-200 focus:outline-none flex justify-between items-center text-cyan-900" onclick="toggleExpand(this)">
            <h3 class="text-lg font-semibold">${file.fileName}</h3>
            <svg class="w-4 h-4 transform transition-transform duration-200" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>
          <div class="p-4">
            <table class="w-full">
              <tbody>
                ${file.occurrences
                  .map(
                    (occ, occIndex) => `
                  <tr class="${
                    (occ.options || {}).disable
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-gray-100 cursor-pointer"
                  }"
                    data-ai="true"
                      data-file-index="${fileIndex}"
                      data-occ-index="${occIndex}">
                    <td class="py-2 px-4 border-b flex items-center">
                      ${
                        occ.ai
                          ? '<svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"></path></svg>'
                          : ""
                      }
                      ${escapeHtml(occ.text)}
                    </td>                    <td class="py-2 px-4 border-b text-right">${
                      occ.line
                    }</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>
      `
        )
        .join("")}

        ${
          aiDetectedOccurrences.length > 0 &&
          possibleDetectedOccurrences.length > 0
            ? `<div class="mt-32 h-2 w-full bg-gray-300"></div>`
            : ""
        }
          ${
            possibleDetectedOccurrences.length > 0
              ? `<h2 class="text-xl font-bold mt-4 mb-2">Possible Detected Occurrences</h2>`
              : ""
          }
${possibleDetectedOccurrences
  .map(
    (file, fileIndex) => `
        <div class="bg-white shadow-md rounded-lg overflow-hidden">
          <button class="w-full text-left px-4 py-2 bg-gray-200 hover:bg-gray-300 focus:outline-none flex justify-between items-center" onclick="toggleExpand(this)">
            <h3 class="text-lg font-semibold">${file.fileName}</h3>
            <svg class="w-4 h-4 transform transition-transform duration-200" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>
          <div class="p-4">
            <table class="w-full">
              <tbody>
                ${file.occurrences
                  .map(
                    (occ, occIndex) => `
                  <tr class="${
                    (occ.options || {}).disable
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-gray-100 cursor-pointer"
                  }"
                      data-ai="false"
                      data-file-index="${fileIndex}"
                      data-occ-index="${occIndex}">
                    <td class="py-2 px-4 border-b flex items-center">
                      ${
                        occ.ai
                          ? '<svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"></path></svg>'
                          : ""
                      }
                      ${escapeHtml(occ.text)}
                    </td>                    <td class="py-2 px-4 border-b text-right">${
                      occ.line
                    }</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>
      `
  )
  .join("")}
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      const aiDetectedOccurrences = ${JSON.stringify(aiDetectedOccurrences)};
      const possibleDetectedOccurrences = ${JSON.stringify(
        possibleDetectedOccurrences
      )};
      
      function toggleExpand(button) {
        const content = button.nextElementSibling;
        content.classList.toggle('hidden');
        const arrow = button.querySelector('svg');
        arrow.classList.toggle('rotate-180');
      }

      document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('tr[data-file-index]').forEach(tr => {
          tr.addEventListener('click', () => {
            const fileIndex = tr.getAttribute('data-file-index');
            const occIndex = tr.getAttribute('data-occ-index');
            const isAIResult = tr.getAttribute('data-ai') === 'true'; 
            const file = isAIResult ? aiDetectedOccurrences[fileIndex] : possibleDetectedOccurrences[fileIndex];
            const occ = file.occurrences[occIndex];
            
            vscode.postMessage({
              command: occ.command,
              line: occ.line,
              text: occ.text,
              filePath: file.filePath,
            });
          });
        });
      });
    </script>
  </body>
  </html>`;
}
