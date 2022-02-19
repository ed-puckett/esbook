const {
    load_script,
} = await import('../../dom-util.js');

await load_script(document.head, new URL('../../../node_modules/d3/dist/d3.min.js', import.meta.url));  // defines globalThis.d3
export const d3 = globalThis.d3;
