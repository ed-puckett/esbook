const {
    create_inline_stylesheet,
    load_script,
} = await import('../../dom-util.js');

const d3_module = await import('./d3.js');
export const d3 = d3_module.d3;

export const dagre_stylesheet_text = `
svg.dagre {
    font: 300 14px 'Helvetica Neue', Helvetica;
    width: 100%;
    height: 100%;
}
svg.dagre .node :is(rect, circle, ellipse, polygon) {
    stroke: #333;
    fill: #fff;
}
svg.dagre .edgePath path {
    stroke: #333;
    fill: #333;
    stroke-width: 1.5px;
}
`;

create_inline_stylesheet(document.head, dagre_stylesheet_text);

await load_script(document.head, new URL('../../../node_modules/dagre-d3/dist/dagre-d3.min.js', import.meta.url));  // defines globalThis.dagreD3
export const dagreD3 = globalThis.dagreD3;
