const {
    escape_for_html,
    set_element_attributes,
    load_script,
    create_stylesheet_link,
} = await import('../dom-util.js');

const {
    generate_object_id,
} = await import('../uuid.js');

await load_script(document.head, new URL('../../node_modules/dompurify/dist/purify.min.js', import.meta.url));  // defines globalThis.DOMPurify


// === CONSTANTS ===

export const TEXT_ELEMENT_CLASS = 'text-content';


// === UTILITY FUNCTIONS ===

// This function is more aggressive that DOMPurify.sanitize() because,
// via escape_for_html(), it converts all '<' and '>' to their corresponding
// HTML entities.  DOMPurify.sanitize() protects from XSS injections, but does
// not do anything with other HTML injection (e.g., a form element) which can
// lead to unexpected behavior is the user interacts with the injected HTML.
export function clean_for_html(s) {
    return escape_for_html(DOMPurify.sanitize(s));
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
        this._id   = generate_object_id();
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
        return output_context.create_text_output_data(this.type, text, this.generate_static_element.bind(this));
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
        return output_context.create_text_output_data(this.type, text, this.generate_static_element.bind(this));
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

class HTMLOutputHandler extends OutputHandler {
    constructor() { super('html'); }

    // output_data: { type: 'html', tag:string, attrs?:json_object, innerHTML?: string }
    // returns the new HTML element
    async update_notebook(output_context, output_data) {
        const output_element = output_context.create_output_element({ tag: 'div' });
        const output_child = await this.generate_static_element(output_data)
        output_element.appendChild(output_child);
        await output_context.create_generic_output_data(this.type, output_data);
        return output_child;
    }

    validate_output_data(output_data) {
        if (typeof output_data !== 'object') {
            return false;
        }
        if (output_data.attrs) {
            if (typeof output_data.attrs !== 'object') {
                return false;
            }
            try {
                JSON.stringify(output_data.attrs);
            } catch (_) {
                return false;
            }
        }
        return ( super.validate_output_data(output_data) &&
                 typeof output_data.tag === 'string' &&
                 ['undefined', 'string'].includes(typeof output_data.innerHTML) );
    }

    async generate_static_element(output_data) {
        if (output_data.type !== this.type) {
            throw new Error(`output_data type does not match (${this.type})`);
        }
        const element = document.createElement(output_data.tag);
        if (output_data.attrs) {
            set_element_attributes(element, output_data.attrs);
        }
        if (typeof element.id === 'undefined' || element.id === null || element.id === '') {
            // id was not set from output_data.attrs
            element.id = generate_object_id();
        }
        if (output_data.innerHTML) {
            element.innerHTML = clean_for_html(output_data.innerHTML);
        }
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
        img_element.classList.add('output-graphics');
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
        const { Chart } = await import('./output-handlers/chart.js');
        const [ size_config, config ] = output_context.parse_graphics_args(value.args, 'usage: chart([size_config], config)');
        const canvas = output_context.create_output_element({
            size_config,
            child_tag: 'canvas',
        });
        const ctx = canvas.getContext('2d');
        // eliminate animation so that the canvas.toDataURL() call below will have something to render:
        Chart.defaults.global.animation.duration = 0;
        const chart_object = new Chart(ctx, config);
        return output_context.create_canvas_output_data(this.type, canvas);
    }
}

class GraphvizOutputHandler extends _GraphicsOutputHandlerBase {
    constructor() {
        super('graphviz');
    }

    // Format of config object: {
    //     node_config?: string,
    //     nodes[]?: (string | [ string/*name*/, string/*options*/ ])[],
    //     edges[]?: [ string/*from*/, string/*to*/, { label?: string, ... }? ][],
    // }

    // may throw an error
    // output_data: { type: 'graphviz', image_format: string, image_format_quality: number, image_uri: string }
    async update_notebook(output_context, value) {
        const { render } = await import('./output-handlers/graphviz.js');
        const [ size_config, graphviz_config ] = output_context.parse_graphics_args(value.args, 'usage: graphviz([size_config], config)');

        const element = output_context.create_output_element({
            size_config,
        });
        const element_selector = `#${element.id}`;

        const dot_stmts = [];
        if (graphviz_config.node_config) {
            dot_stmts.push(`node ${node_config}`);
        }
        for (const node_spec of (graphviz_config.nodes ?? [])) {
            if (typeof node_spec === 'string') {
                const name = node_spec;
                dot_stmts.push(name);
            } else {
                const [ name, options ] = node_spec;
                dot_stmts.push(`${name} [${options}]`);
            }
        }
        for (const [ from, to, options ] of (graphviz_config.edges ?? [])) {
            dot_stmts.push(`${from}->${to}${options ? `[${options}]` : ''}`);
        }
        const dot = `digraph { ${dot_stmts.join(';')} }`;

        // create and run the renderer
        await render(element_selector, dot, {});

        // finally, render the data uri
        const svg = element.querySelector('svg');
        return output_context.create_svg_output_data(this.type, svg, false);
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
        return output_context.create_canvas_output_data(this.type, canvas);
    }
}

class PlotlyOutputHandler extends _GraphicsOutputHandlerBase {
    constructor() { super('plotly'); }

    // Format of config object: { data, layout, config, frames }
    // (the sub-objects layout, config and frames are optional)

    // may throw an error
    // output_data: { type: 'plotly', image_format: string, image_format_quality: number, image_uri: string }
    async update_notebook(output_context, value) {
        const { Plotly } = await import('./output-handlers/plotly.js');
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
        return output_context.create_generic_output_data(this.type, output_data_props);
    }
}


// === OUTPUT HANDLER MAPPINGS ===

export const output_handler_id_to_handler =  // handler_id->handler
    Object.fromEntries(
        [
            TextOutputHandler,
            ErrorOutputHandler,
            HTMLOutputHandler,
            GenericImageOutputHandler,
            ChartOutputHandler,
            GraphvizOutputHandler,
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
