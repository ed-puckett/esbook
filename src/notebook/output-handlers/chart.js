const {
    load_script,
} = await import('../../dom-util.js');

await load_script(document.head, new URL('../../../node_modules/chart.js/dist/Chart.bundle.min.js', import.meta.url));  // defines globalThis.Chart
export const Chart = globalThis.Chart;
