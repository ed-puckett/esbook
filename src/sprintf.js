const {
    load_script,
} = await import('./dom-util.js');

const sprintf_url = new URL('../node_modules/sprintf-js/dist/sprintf.min.js', import.meta.url);
await load_script(document.head, sprintf_url);

export const sprintf = globalThis.sprintf;
