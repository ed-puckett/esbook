const {
    load_script,
} = await import('../../dom-util.js');

await load_script(document.head, new URL('../../../node_modules/plotly.js-dist/plotly.js', import.meta.url));  // defines globalThis.Plotly
export const Plotly = globalThis.Plotly;
