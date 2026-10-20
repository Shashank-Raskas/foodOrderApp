// Babel is used only by Jest (frontend tests). Vite's build doesn't read this file:
// @vitejs/plugin-react runs Babel with configFile: false.

/**
 * Jest runs code as CommonJS, where Vite's `import.meta.env` doesn't exist.
 * Rewrite `import.meta.env` to an object built from process.env, so tests can set VITE_* variables.
 */
function viteImportMetaEnv({ types: t, template }) {
  const buildEnv = template.expression.ast(`({
    ...process.env,
    MODE: process.env.NODE_ENV,
    DEV: process.env.NODE_ENV !== 'production',
    PROD: process.env.NODE_ENV === 'production',
  })`);
  return {
    name: 'vite-import-meta-env',
    visitor: {
      MemberExpression(path) {
        const { object, property } = path.node;
        if (
          t.isMetaProperty(object) &&
          object.meta.name === 'import' &&
          object.property.name === 'meta' &&
          t.isIdentifier(property, { name: 'env' })
        ) {
          path.replaceWith(t.cloneNode(buildEnv, true));
        }
      },
    },
  };
}

module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
  ],
  plugins: [viteImportMetaEnv],
};
