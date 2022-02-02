const {
    load_script,
} = await import('./dom-util.js');

const sha256_url = new URL('../node_modules/js-sha256/build/sha256.min.js', import.meta.url);
await load_script(document.head, sha256_url);

export const sha256 = globalThis.sha256;
