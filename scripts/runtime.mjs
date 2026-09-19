import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export async function dependency(name) {
  let require = createRequire(import.meta.url);
  const load = async path => {
    const module = await import(pathToFileURL(path).href);
    return { ...module.default, ...module };
  };
  try { return await load(require.resolve(name)); }
  catch (error) {
    if (!process.env.TEST_RUNTIME_ROOT) throw new Error(`Install devDependencies or set TEST_RUNTIME_ROOT for ${name}`, { cause: error });
    // Explicit test harness setting only; never loaded by a browser page.
    require = createRequire(resolve(process.env.TEST_RUNTIME_ROOT, '__test-runtime.cjs'));
    return load(require.resolve(name));
  }
}
