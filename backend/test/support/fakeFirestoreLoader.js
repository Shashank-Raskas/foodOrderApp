// Node module hook used by e2e-server.js: any import of backend/firebase.js gets the in-memory fake instead.
const FAKE = new URL('./fakeFirestore.js', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  const result = await nextResolve(specifier, context);
  if (result.url.endsWith('/backend/firebase.js')) {
    return { url: FAKE, shortCircuit: true };
  }
  return result;
}
