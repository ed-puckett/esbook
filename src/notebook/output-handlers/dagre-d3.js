const {
    create_stylesheet_link,
    load_script,
} = await import('../../dom-util.js');

const d3_module = await import('./d3.js');
export const d3 = d3_module.d3;

const dagreD3_stylesheet_url = new URL('./dagre-d3.css', import.meta.url);
create_stylesheet_link(document.head, dagreD3_stylesheet_url);

await load_script(document.head, new URL('../../../node_modules/dagre-d3/dist/dagre-d3.min.js', import.meta.url));  // defines globalThis.dagreD3
export const dagreD3 = globalThis.dagreD3;
