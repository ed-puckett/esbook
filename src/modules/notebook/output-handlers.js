await Promise.all(
    [
        '../../../node_modules/dompurify/dist/purify.min.js',       // defines globalThis.DOMPurify
        '../../../node_modules/chart.js/dist/Chart.bundle.min.js',  // defines globalThis.Chart
        '../../../node_modules/d3/dist/d3.min.js',                  // defines globalThis.d3
        '../../../node_modules/dagre-d3/dist/dagre-d3.min.js',      // defines globalThis.dagreD3
        '../../../node_modules/plotly.js-dist/plotly.js',           // defines globalThis.Plotly
    ].map(p => globalThis.core.load_script(document.head, new URL(p, import.meta.url)))
);

const dagreD3_stylesheet_url = new URL('output-handlers/dagre-d3.css', import.meta.url);
globalThis.core.create_stylesheet_link(document.head, dagreD3_stylesheet_url);


// === CONSTANTS ===

export const TEXT_ELEMENT_CLASS = 'text-content';


// === UTILITY FUNCTIONS ===

// This function is more aggressive that DOMPurify.sanitize() because,
// via globalThis.core.escape_for_html(), it converts all '<' and '>' to
// their corresponding HTML entities.  DOMPurify.sanitize() protects from
// XSS injections, but does not do anything with other HTML injection
// (e.g., a form element) which can lead to unexpected behavior is the
// user interacts with the injected HTML.
export function clean_for_html(s) {
    return globalThis.core.escape_for_html(DOMPurify.sanitize(s));
}

export function escape_unescaped_$(s) {
    // Note: add $ to the end and then remove the last two characters ('\\$') from
    // the result.  Why?  Because the RE does not work correctly when the remaining
    // part after a match does not contain a non-escaped $.  This workaround works
    // correctly even if s ends with \.
    const re = /((\\?.)*?)\$/g;
    return (s + '$').replace(re, (...args) => `${args[1]}\\$`).slice(0, -2);
}


// === OUTPUT HANDLERS ===

// CREATING A NEW OUTPUT HANDLER
// -----------------------------
// 1. Define a new output handler class which extends OutputHandler,
//    creating a new update_notebook() method, and if the new output
//    type is significantly different than its base class, new
//    validate_output_data() and generate_static_element() methods.
// 2. Add the new class to the expression which creates the
//    output_handler_id_to_handler mapping.

// FUNCTIONS OF AN OUTPUT_HANDLER
// ------------------------------
// 1. During Eval: create new output elements through the use of the
//    output_context (which is provided by the notebook and encapsulates
//    the ie and output_data_collection).  The output elements include
//    both the UI elements and the output_data accumulated in the
//    output_data_collection.
//    Method: update_notebook()
// 2. Validate output_data received from a file.
//    Method: validate_output_data()
// 3. Display non-evaluated output_data received from a file.
//    Method: generate_static_element()

class OutputHandler {
    constructor(type) {
        this._type = type;
        this._id   = globalThis.core.generate_object_id();
    }

    get type (){ return this._type; }
    get id   (){ return this._id; }

    // Generator for output element and static representation (output_data).
    // The output element is appended to ie output section, and the static
    // representation is appended to output_data_collection.
    // Must be defined by each extension.
    // May throw an error.
    async update_notebook(output_context, value) {
        throw new Error('unimplemented');
    }

    // Returns true iff the structure of the data is acceptable
    // for generate_static_element().
    validate_output_data(output_data) {
        // This is the most basic test:
        return ( typeof output_data === 'object' &&
                 output_data?.type === this.type );
    }

    // Returns a non-live node for the given output_data.
    async generate_static_element(output_data) {
        throw new Error('unimplemented');
    }
}

class TextOutputHandler extends OutputHandler {
    constructor() { super('text'); }

    // Warning: if the last ie output_data was also of type text, the new content
    // is merged into it.
    // value: string | { text: string, is_tex?: boolean, inline_tex?: boolean }
    // output_data: { type: 'text', text: string }
    async update_notebook(output_context, value) {
        if (typeof value === 'string') {
            value = { text: value };
        }
        const tex_delimiter = value.inline_tex ? '$' : '$$';
        const text = (value.is_tex ? `${tex_delimiter}${escape_unescaped_$(value.text)}${tex_delimiter}` : value.text);
        await output_context.create_text_output_data(this.type, text, this.generate_static_element.bind(this));
    }

    validate_output_data(output_data) {
        return ( super.validate_output_data(output_data) &&
                 typeof output_data.text === 'string' );
    }

    async generate_static_element(output_data) {
        if (output_data.type !== this.type) {
            throw new Error(`output_data type does not match (${this.type})`);
        }
        const { text } = output_data;
        const text_to_add = text ?? '';
        const element = document.createElement('span');
        element.classList.add(TEXT_ELEMENT_CLASS);
        element.innerHTML = clean_for_html(text_to_add);
        return element;
    }
}

class ErrorOutputHandler extends OutputHandler {
    constructor() { super('error'); }

    // output_data: { type: 'error', text: string }
    async update_notebook(output_context, error_object) {
        const text_segments = [];
        if (error_object.stack) {
            text_segments.push(error_object.stack);
        } else {
            text_segments.push(error_object.message || 'error');
        }
        const text = clean_for_html(text_segments.join('\n'));
        await output_context.create_text_output_data(this.type, text, this.generate_static_element.bind(this));
    }

    validate_output_data(output_data) {
        return ( super.validate_output_data(output_data) &&
                 typeof output_data.text === 'string' );
    }

    async generate_static_element(output_data) {
        if (output_data.type !== this.type) {
            throw new Error(`output_data type does not match (${this.type})`);
        }
        const element = document.createElement('pre');
        element.classList.add('error');
        element.textContent = output_data.text;
        return element;
    }
}

function _generate_image_element_from_output_data(output_data) {
    if (!output_data.image_uri) {
        return undefined;
    } else {
        const img_element = document.createElement('img');
        const size_styles = [];
        if (typeof output_data.width !== 'undefined') {
            size_styles.push(`width: ${output_data.width}px`);
        }
        if (typeof output_data.height !== 'undefined') {
            size_styles.push(`height: ${output_data.height}px`);
        }
        if (size_styles.length > 0) {
            img_element.style = size_styles.join('; ');
        }
        img_element.src = output_data.image_uri;
        img_element.alt = `${output_data.type ? `${output_data.type} ` : ''}graphics`;
        return img_element;
    }
}

class _GraphicsOutputHandlerBase extends OutputHandler {
    constructor(type) { super(type); }

    validate_output_data(output_data) {
        if (!super.validate_output_data(output_data)) {
            return false;
        }
        const { image_uri } = output_data;
        if (typeof image_uri !== 'string') {
            return false;
        }
        //!!! should also check the image_uri for correct mime-type and format...
        return true;
    }

    async generate_static_element(output_data) {
        if (output_data.type !== this.type) {
            throw new Error(`output_data type does not match (${this.type})`);
        }
        const static_element = _generate_image_element_from_output_data(output_data);
        if (!static_element) {
            throw new Error('unexpected: _generate_image_element_from_output_data() did not produce an element');
        }
        return static_element;
    }
}

class GenericImageOutputHandler extends _GraphicsOutputHandlerBase {
    constructor() { super('generic'); }
}

class ChartOutputHandler extends _GraphicsOutputHandlerBase {
    constructor() { super('chart'); }

    // Format of config object: see Chart.js documentation

    // may throw an error
    // output_data: { type: 'chart', image_format: string, image_format_quality: number, image_uri: string }
    async update_notebook(output_context, value) {
        const [ size_config, config ] = output_context.parse_graphics_args(value.args, 'usage: chart([size_config], config)');
        const canvas = output_context.create_output_element({
            size_config,
            child_tag: 'canvas',
        });
        const ctx = canvas.getContext('2d');
        // eliminate animation so that the canvas.toDataURL() call below will have something to render:
        Chart.defaults.global.animation.duration = 0;
        const chart_object = new Chart(ctx, config);
        await output_context.create_canvas_output_data(this.type, canvas);
    }
}

class DagreOutputHandler extends _GraphicsOutputHandlerBase {
    constructor() {
        super('dagre');
        this._default_initial_scale = 1;
        this._default_left_margin   = 30;
        this._default_height_margin = 40;
    }

    get default_initial_scale (){ return this._default_initial_scale; }
    get default_left_margin   (){ return this._default_left_margin;   }
    get default_height_margin (){ return this._default_height_margin; }

    // Format of config object: {
    //     nodes[]?: [ string/*name*/, { style?:string, svg_attr?: [ attr:string, value:any ][] }?, ... ][],
    //     edges[]?: [ string/*from*/, string/*to*/, { label?: string, style?: string, ... }? ][],
    //     node_options?: {
    //         style?: string,
    //         ...
    //     },
    //     node_svg_attr[]?: [ attr:string, value:any ],  // may also be an object instead of array of key/value pairs
    //     edge_options?: {
    //         style?: string,
    //         ...
    //     },
    //     render_options?: {
    //         initial_scale?: number,  // default: 1
    //         left_margin?:   number,  // default: 30
    //         height_margin?: number,  // default: 40
    //     },
    // }

    // may throw an error
    // output_data: { type: 'dagre', image_format: string, image_format_quality: number, image_uri: string }
    async update_notebook(output_context, value) {
        const [ size_config, dagre_config ] = output_context.parse_graphics_args(value.args, 'usage: dagre([size_config], config)');
        // svg elements must be created with a special namespace
        // (otherwise, will get error when rendering: xxx.getBBox is not a function)
        const svg_namespace = 'http://www.w3.org/2000/svg';
        const svg = output_context.create_output_element({
            size_config,
            child_tag: 'svg',
            child_element_namespace: svg_namespace,
            child_attrs: {
                class: 'dagre',
            },
        });
        svg.appendChild(document.createElementNS(svg_namespace, 'g'));  // required by dagreD3
        svg.addEventListener('wheel', function (event) {
            if (!event.shiftKey) {
                // stop normal scroll wheel event from zooming the svg
                event.stopImmediatePropagation();
            }
        }, true);
        const graph = new dagreD3.graphlib.Graph().setGraph({});
        const {
            node_options:  all_node_options,   // for all nodes
            node_svg_attr: all_node_svg_attr,  // for all nodes
            edge_options:  all_edge_options,   // for all edges
            render_options,
        } = dagre_config;
        const { style: all_node_style } = (all_node_options ?? {});  // separate style from other node options
        const extra_all_node_options = all_node_options ? { ...all_node_options, style: undefined } : {};
        const extra_all_edge_options = all_edge_options ? { ...all_edge_options } : {};
        function combine_styles(global, local) {
            return (global && local)
                ? `${global}; ${local}`
                : global ? global : local;
        }
        for (const node_config of (dagre_config.nodes ?? [])) {
            let name, options, style, svg_attr;
            let node_options;
            if (typeof node_config === 'string') {
                name = node_config;
                options = {};
                node_options = { ...extra_all_node_options, label: name };
            } else {
                [ name, options ] = node_config;
                style    = options?.style;
                svg_attr = options?.svg_attr;
                const node_extra_options = { ...extra_all_node_options, ...(options ?? {}), style: undefined, svg_attr: undefined };
                node_options = {
                    label: name,
                    ...node_extra_options,
                };
            }
            graph.setNode(name, node_options);
            const node = graph.node(name);
            const combined_style = combine_styles(all_node_style, style);
            if (combined_style) {
                node.style = combined_style;
            }
            if (svg_attr) {
                const key_value_pairs = (typeof svg_attr === 'object')
                      ? Object.entries(svg_attr)
                      : svg_attr;  // assumed to already be an array of key/value pairs
                for (const [ attr_name, attr_value ] of key_value_pairs) {
                    node[attr_name] = attr_value;
                }
            }
        }
        if (all_node_svg_attr) {
            const key_value_pairs = (typeof all_node_svg_attr === 'object')
                  ? Object.entries(all_node_svg_attr)
                  : all_node_svg_attr;  // assumed to already be an array of key/value pairs
            for (const node_id of graph.nodes()) {
                const node = graph.node(node_id);
                for (const [ attr_name, attr_value ] of key_value_pairs) {
                    node[attr_name] = attr_value;
                }
            }
        }
        for (const [ from, to, edge_options ] of (dagre_config.edges ?? [])) {
            const edge_extra_options = { ...extra_all_edge_options, ...(edge_options ?? {}) };
            graph.setEdge(from, to, {
                curve: d3.curveBasis,
                ...edge_extra_options,
            });
        }
        // realize the graph
        const svg_d3 = d3.select(`#${svg.id}`);
        const inner = svg_d3.select("g");
        // set up zoom support
        const zoom = d3.zoom().on("zoom", function() {
console.log('>>>', d3.event);//!!!
            if (d3.event) inner.attr("transform", d3.event.transform);
        });
        svg_d3.call(zoom);
        // create and run the renderer
        const render = new dagreD3.render();
        render(inner, graph);
        // adjust the graph size and position
        const initial_scale = render_options?.initial_scale ?? this.default_initial_scale;
        const left_margin   = render_options?.left_margin   ?? this.default_left_margin;
        const height_margin = render_options?.height_margin ?? this.default_height_margin;
        const { width: g_width, height: g_height } = graph.graph();
        svg_d3.call(zoom.transform, d3.zoomIdentity.translate(left_margin, height_margin/2).scale(initial_scale));
        svg_d3.attr('height', (g_height*initial_scale + height_margin));
        // finally, render the data uri
        await output_context.create_svg_output_data(this.type, svg);
    }
}

class ImageDataOutputHandler extends _GraphicsOutputHandlerBase {
    constructor() { super('image_data'); }

    // Format of config object: {
    //     x?:         number,  // default value: 0
    //     y?:         number,  // default value: 0
    //     image_data: ImageData,
    // }
    // (or an array of these objects)

    // may throw an error
    // output_data: { type: 'image_data', image_format: string, image_format_quality: number, image_uri: string }
    async update_notebook(output_context, value) {
        const [ size_config, config ] = output_context.parse_graphics_args(value.args, 'usage: image_data([size_config], config)');
        const canvas = output_context.create_output_element({
            size_config,
            child_tag: 'canvas',
        });
        const ctx = canvas.getContext('2d');
        const iter_config = Array.isArray(config) ? config : [ config ];
        for (const { x = 0, y = 0, image_data } of iter_config) {
            ctx.putImageData(image_data, x, y);
        }
        await output_context.create_canvas_output_data(this.type, canvas);
    }
}

class PlotlyOutputHandler extends _GraphicsOutputHandlerBase {
    constructor() { super('plotly'); }

    // Format of config object: { data, layout, config, frames }
    // (the sub-objects layout, config and frames are optional)

    // may throw an error
    // output_data: { type: 'plotly', image_format: string, image_format_quality: number, image_uri: string }
    async update_notebook(output_context, value) {
        const [ size_config, config ] = output_context.parse_graphics_args(value.args, 'usage: plotly([size_config], { data, layout?, config?, frames? })');
        const output_element = output_context.create_output_element({
            size_config,
            child_tag: 'div',
        });
        const image_type = 'png';
        const image_format = 'image/png';
        const image_format_quality = 1.0;
        const output_data_props = await Plotly.newPlot(output_element, config)  // render to the output_element
              .then(gd => Plotly.toImage(gd, {  // render data uri
                  format: image_type,  // note: not image_format
                  width:  output_element.clientWidth,
                  height: output_element.clientHeight,
              }))
              .then(image_uri => {
                  return image_uri;
              })
              .then(image_uri => ({  // convert to format for output_data
                  image_format,
                  image_format_quality,
                  image_uri,
              }));
        await output_context.create_generic_graphics_output_data(type, output_data_props);
    }
}


// === OUTPUT HANDLER MAPPINGS ===

export const output_handler_id_to_handler =  // handler_id->handler
    Object.fromEntries(
        [
            TextOutputHandler,
            ErrorOutputHandler,
            GenericImageOutputHandler,
            ChartOutputHandler,
            DagreOutputHandler,
            ImageDataOutputHandler,
            PlotlyOutputHandler,

        ].map( handler_class => {
            const handler = new handler_class();
            return [ handler.id, handler ];
        })
    );

export const output_handlers =  // handler_type->handler
    Object.fromEntries(
        Object.entries(output_handler_id_to_handler)
            .map(([handler_id, handler]) => [
                handler.type,
                handler,
            ])
    );
