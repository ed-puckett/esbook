const {
    create_inline_stylesheet,
    load_script,
} = await import('../../dom-util.js');

const d3_module = await import('./d3.js');
export const d3 = d3_module.d3;

await load_script(document.head, new URL('../../../node_modules/@hpcc-js/wasm/dist/graphviz.umd.js',   import.meta.url));
await load_script(document.head, new URL('../../../node_modules/d3-graphviz/build/d3-graphviz.min.js', import.meta.url));

export async function render(element_selector, dot, options) {
    const {
        transition = "main",
        ease       = d3.easeLinear,
        delay      = 500,
        duration   = 1500,
        logEvents  = true,
    } = (options ?? {});
    try {
        return new Promise((resolve, reject) => {
            function reject_with_string(...args) {
                reject(new Error(args[0]));
            }
            const graphviz = d3.select(element_selector).graphviz({
                useWorker:       false,
                useSharedWorker: false,
            });
            graphviz
                .transition(function () {
                    return d3.transition(transition)
                        .ease(ease)
                        .delay(delay)
                        .duration(duration);
                })
                .logEvents(logEvents)
                .onerror(reject_with_string)
                .on("initEnd", function () {
                    graphviz
                        .renderDot(dot)
                        .onerror(reject_with_string)
                        .on("end", resolve);
                });
        });
    } catch (error) {
        reject(error);
    }
}
