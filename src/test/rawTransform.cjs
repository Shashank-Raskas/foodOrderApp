// Jest stand-in for Vite's `?raw` imports: the file's text becomes the module's default export.
module.exports = {
  process(sourceText) {
    return { code: `module.exports = ${JSON.stringify(sourceText)};` };
  },
};
