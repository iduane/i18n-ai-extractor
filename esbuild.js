const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["extension.js"],
    bundle: true,
    format: "cjs", // Keep this as 'cjs'
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "dist/extension.js",
    external: ["vscode"],
    logLevel: "silent",
    plugins: [topLevelAwaitPlugin, esbuildProblemMatcherPlugin],
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

// Add this new plugin
const topLevelAwaitPlugin = {
  name: "top-level-await",
  setup(build) {
    build.onLoad(
      { filter: /node_modules\/dictionary-en\/index\.js$/ },
      async (args) => {
        const fs = require("fs");
        const contents = await fs.promises.readFile(args.path, "utf8");
        const transformedContents = contents.replace(/await/g, "yield");
        return {
          contents: `module.exports = (async function*() { ${transformedContents} })().next().value;`,
          loader: "js",
        };
      }
    );
  },
};

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",

  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`
        );
      });
      console.log("[watch] build finished");
    });
  },
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
