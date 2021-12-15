'use strict';

(async ({ current_script, facet_export, facet_load_error }) => { try {  // facet begin

    const svg_image_util = await facet(new URL('output-handlers/svg-image-util.js', current_script.src));

    await Promise.all(
        [
            '../../../node_modules/dompurify/dist/purify.min.js',   // defines globalThis.DOMPurify
            '../../../node_modules/chart.js/dist/chart.min.js',     // defines globalThis.Chart
            '../../../node_modules/d3/dist/d3.min.js',              // defines globalThis.d3
            '../../../node_modules/dagre-d3/dist/dagre-d3.min.js',  // defines globalThis.dagreD3
            '../../../node_modules/plotly.js-dist/plotly.js',       // defines globalThis.Plotly
        ].map(p => load_script(document.head, new URL(p, current_script.src)))
    );

    const dagreD3_stylesheel_url = new URL('output-handlers/dagre-d3.css', current_script.src);
    create_child_element(document.head, 'link', 'rel', "stylesheet", 'href', dagreD3_stylesheel_url);


    // === CONSTANTS ===

    const TEXT_ELEMENT_CLASS = 'text-content';


    // === UTILITY FUNCTIONS ===

    function escape_for_html(s) {
        return s.replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    }

    // This function is more aggressive that DOMPurify.sanitize() because,
    // via escape_for_html(), it converts all '<' and '>' to their corresponding
    // HTML entities.  DOMPurify.sanitize() protects from XSS injections, but
    // does not do anything with other HTML injection (e.g., a form element)
    // which can lead to unexpected behavior is the user interacts with the
    // injected HTML.
    function clean_for_html(s) {
        return escape_for_html(DOMPurify.sanitize(s));
    }

    function escape_unescaped_$(s) {
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
    // !!! UPDATE ME !!!
    // 1. Define a new output handler class which extends OutputHandler, creating
    //    new update_notebook() and generate_static_element() methods.
    // 2. Add the new class to the expression which creates the
    //    output_handler_id_to_handler mapping.
    // 3. (Optional) add a new function for the output handler in
    //    the eval code.  This function will call the self.output()
    //    function with the first argument as the "type" string you
    //    provided in the super() call in the new OutputHandler constructor.
    // 4. Add a new interface in ../eval-worker/eval-worker.js for the new
    //    output handler.
    // 5. Update help to reflect the new interface to the new output handler.

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
        async update_notebook(ie, output_data_collection, value) {
            throw new Error('unimplemented');
        }

        // Returns a non-live node for the given output_data.
        async generate_static_element(output_data) {
            throw new Error('unimplemented');
        }

        // internal/utility methods

        _validate_size_config(size_config) {
            if ( !Array.isArray(size_config) ||
                 size_config.length !== 2 ||
                 typeof size_config[0] !== 'number' ||
                 typeof size_config[1] !== 'number' ) {
                throw new Error('size_config must be an array containing two numbers');
            }
        }

        _parse_graphics_args(args, error_message) {
            if (args.length < 1 || args.length > 2) {
                throw new Error(error_message);
            }
            let size_config, config;
            if (args.length < 2) {
                config = args[0];
            } else {
                [ size_config, config ] = args;
            }
            if (size_config) {
                this._validate_size_config(size_config);
            }
            if (config === null || typeof config !== 'object') {
                throw new Error('config must be a non-null object');
            }
            return [ size_config, config ];
        }

        _create_output_element(ie, size_config=null, child_tag=null, child_element_namespace=null) {
            // Re: Chart.js:
            // Wrap the canvas element in a div to prevent quirky behavious of Chart.js size handling.
            // See: https://stackoverflow.com/questions/19847582/chart-js-canvas-resize.
            // (Note: doing this for all text/graphics types)
            const output_element = document.createElement('div');
            output_element.id = generate_object_id();
            const output_element_collection = ie.querySelector('.output');
            output_element_collection.appendChild(output_element);
            let child;
            if (child_tag) {
                if (child_element_namespace) {
                    child = document.createElementNS(child_element_namespace, child_tag);
                } else {
                    child = document.createElement(child_tag);
                }
                child.id = generate_object_id();
            }
            if (size_config) {
                const [ width, height ] = size_config;
                output_element.width  = width;
                output_element.height = height;
                output_element.style.width  = `${width}px`;
                output_element.style.height = `${height}px`;
                if (child) {
                    child.width  = width;
                    child.height = height;
                }
            }
            if (child) {
                output_element.appendChild(child);
            }
            return child ? child : output_element;
        }

        async _render_canvas_image_data(canvas) {
            // Save an image of the rendered canvas.  This will be used if this
            // notebook is saved and then loaded again later.
            // Note: using image/png because image/jpeg fails on Firefox (as of writing)
            const image_format = 'image/png';
            const image_format_quality = 1.0;
            const image_uri = canvas.toDataURL(image_format, image_format_quality);
            return {
                type: this.type,
                image_format,
                image_format_quality,
                image_uri,
            };
        }

        async _render_svg_image_data(svg) {
            // Save an image of the rendered canvas.  This will be used if this
            // notebook is saved and then loaded again later.
            const css = svg_image_util.get_all_css_with_selector_prefix('svg.dagre');
            const svg_string = svg_image_util.getSVGString(svg, css);
            const width  = svg.clientWidth;
            const height = svg.clientHeight;
            const image_format = 'image/svg+xml';
            const image_uri = `data:${image_format};utf8,`+ encodeURIComponent(svg_string);
            // The width and height are necessary because when we load this later (using the svg data uri)
            // the image width and height will not be set (as opposed to a png data uri which encodes
            // the width and height in its content).
            return {
                type: this.type,
                width,
                height,
                image_format,
                image_uri,
            };
        }

        _scroll_output_into_view(ie) {
            const interaction_area = document.getElementById('interaction_area');
            const ia_rect = interaction_area.getBoundingClientRect();
            const ie_rect = ie.getBoundingClientRect();
            if (ie_rect.bottom > ia_rect.bottom) {
                interaction_area.scrollBy(0, (ie_rect.bottom - ia_rect.bottom));
            }
        }
    }

    class TextOutputHandler extends OutputHandler {
        constructor() { super('text'); }

        // Warning: if the last ie output_data was also of type text, the new content
        // is merged into it.
        // value: string | { text: string, is_tex?: boolean, inline_tex?: boolean }
        // output_data: { type: 'text', text: string }
        async update_notebook(ie, output_data_collection, value) {
            if (typeof value === 'string') {
                value = { text: value };
            }
            const tex_delimiter = value.inline_tex ? '$' : '$$';
            const output_data= {
                type: this.type,
                text: (value.is_tex ? `${tex_delimiter}${escape_unescaped_$(value.text)}${tex_delimiter}` : value.text),
            };
            const output_element_collection = ie.querySelector('.output');
            const previous_output_data = output_data_collection[output_data_collection.length-1];
            // connect output_data and output_element into notebook and ui
            if (previous_output_data?.type === this.type) {
                // merge new data into previous
                previous_output_data.text += output_data.text;
                const merged_output_element = await this.generate_static_element(previous_output_data);
                merged_output_element.id = output_element_collection.lastChild.id;  // preserve id
                output_element_collection.lastChild.replaceWith(merged_output_element);
            } else {
                // add new output_data and output_element
                const output_element = await this.generate_static_element(output_data);
                output_element_collection.appendChild(output_element);
                output_data_collection.push(output_data);
                this._scroll_output_into_view(ie);
            }
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

        // output_data: { type: 'error', message: string }
        async update_notebook(ie, output_data_collection, error_object) {
            const message_segments = [];
            if (error_object.stack) {
                message_segments.push(error_object.stack);
            } else {
                message_segments.push(error_object.message || 'error');
            }
            const output_data = {
                type: this.type,
                message: clean_for_html(message_segments.join('\n')),
            };
            const output_element = await this.generate_static_element(output_data);
            // connect output_data and output_element into notebook and ui
            const output_element_collection = ie.querySelector('.output');
            output_element_collection.appendChild(output_element);
            output_data_collection.push(output_data);
            this._scroll_output_into_view(ie);
        }

        async generate_static_element(output_data) {
            if (output_data.type !== this.type) {
                throw new Error(`output_data type does not match (${this.type})`);
            }
            const element = document.createElement('pre');
            element.classList.add('error');
            element.textContent = output_data.message;
            return element;
        }
    }

    class _GraphicsOutputHandlerBase extends OutputHandler {
        constructor(type) { super(type); }

        async generate_static_element(output_data) {
            if (output_data.type !== this.type) {
                throw new Error(`output_data type does not match (${this.type})`);
            }
            // graphics (display image included in output_data)
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
            img_element.alt = `${output_data.type} graphics`;
            return img_element;
        }
    }

    class ChartOutputHandler extends _GraphicsOutputHandlerBase {
        constructor() { super('chart'); }

        // Format of config object: see Chart.js documentation

        // may throw an error
        // output_data: { type: 'chart', image_format: string, image_format_quality: number, image_uri: string }
        async update_notebook(ie, output_data_collection, value) {
            const [ size_config, config ] = this._parse_graphics_args(value.args, 'usage: chart([size_config], config)');
            const canvas = this._create_output_element(ie, size_config, 'canvas');
            const ctx = canvas.getContext('2d');
            // eliminate animation so that the canvas.toDataURL() call below will have something to render:
            Chart.defaults.global.animation.duration = 0;
            const chart_object = new Chart(ctx, config);
            const output_data = await this._render_canvas_image_data(canvas);
            output_data_collection.push(output_data);
            this._scroll_output_into_view(ie);
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
        async update_notebook(ie, output_data_collection, value) {
            const [ size_config, dagre_config ] = this._parse_graphics_args(value.args, 'usage: dagre([size_config], config)');
            // svg elements must be created with a special namespace
            // (otherwise, will get error when rendering: xxx.getBBox is not a function)
            const element_namespace = 'http://www.w3.org/2000/svg';
            const svg = this._create_output_element(ie, size_config, 'svg', element_namespace);
            svg.classList.add('dagre');
            svg.appendChild(document.createElementNS(element_namespace, 'g'));  // required by dagreD3
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
                inner.attr("transform", d3.event.transform);
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
            const output_data = await this._render_svg_image_data(svg);
            output_data_collection.push(output_data);
            this._scroll_output_into_view(ie);
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
        async update_notebook(ie, output_data_collection, value) {
            const [ size_config, config ] = this._parse_graphics_args(value.args, 'usage: image_data([size_config], config)');
            const canvas = this._create_output_element(ie, size_config, 'canvas');
            const ctx = canvas.getContext('2d');
            const iter_config = Array.isArray(config) ? config : [ config ];
            for (const { x = 0, y = 0, image_data } of iter_config) {
                ctx.putImageData(image_data, x, y);
            }
            const output_data = await this._render_canvas_image_data(canvas);
            output_data_collection.push(output_data);
            this._scroll_output_into_view(ie);
        }
    }

    class Canvas2dOutputHandler extends _GraphicsOutputHandlerBase {
        constructor() { super('canvas2d'); }

        // Format of config object: (method_spec|setter_spec)[]
        // Where:
        //
        // method_spec: {
        //     method: string,
        //     args:   any[],
        // }
        //
        // setter_spec: {
        //     setter: true,
        //     field:  string,
        //     value:  any,
        // }

        // may throw an error
        // output_data: { type: 'canvas2d', image_format: string, image_format_quality: number, image_uri: string }
        async update_notebook(ie, output_data_collection, value) {
            const [ size_config, config ] = this._parse_graphics_args(value.args, 'usage: canvas2d([size_config], config)');
            const canvas = this._create_output_element(ie, size_config, 'canvas');
            const ctx = canvas.getContext('2d');
            for (const spec of config) {
                try {
                    if (spec.setter) {
                        const { field, value } = spec;
                        ctx[field] = value;
                    } else {
                        const { method, args } = spec;
                        ctx[method].apply(ctx, args);
                    }
                } catch (err) {
                    throw new Error(`illegal Canvas2d ${spec.setter ? `setter instruction: field: ${spec.field}` : `method instruction: method: ${spec.method}`}`);
                }
            }
            const output_data = await this._render_canvas_image_data(canvas);
            output_data_collection.push(output_data);
            this._scroll_output_into_view(ie);
        }
    }

    class PlotlyOutputHandler extends _GraphicsOutputHandlerBase {
        constructor() { super('plotly'); }

        // Format of config object: { data, layout, config, frames }
        // (the sub-objects layout, config and frames are optional)

        // may throw an error
        // output_data: { type: 'plotly', image_format: string, image_format_quality: number, image_uri: string }
        async update_notebook(ie, output_data_collection, value) {
            const [ size_config, config ] = this._parse_graphics_args(value.args, 'usage: plotly([size_config], { data, layout?, config?, frames? })');
            const output_element = this._create_output_element(ie, size_config, 'div');
            const type = this.type;  // graphics type
            const image_type = 'png';
            const image_format = 'image/png';
            const image_format_quality = 1.0;
            const output_data = await Plotly.newPlot(output_element, config)  // render to the output_element
                  .then(gd => Plotly.toImage(gd, {  // render data uri
                      format: image_type,  // note: not image_format
                      width:  output_element.clientWidth,
                      height: output_element.clientHeight,
                  }))
                  .then(image_uri => {
                      return image_uri;
                  })
                  .then(image_uri => ({  // convert to format for output_data
                      type,
                      image_format,
                      image_format_quality,
                      image_uri,
                  }));

            output_data_collection.push(output_data);
            this._scroll_output_into_view(ie);
        }
    }


    // === OUTPUT HANDLER MAPPINGS ===

    const output_handler_id_to_handler =  // handler_id->handler
          Object.fromEntries(
              [
                  TextOutputHandler,
                  ErrorOutputHandler,
                  ChartOutputHandler,
                  DagreOutputHandler,
                  ImageDataOutputHandler,
                  Canvas2dOutputHandler,
                  PlotlyOutputHandler,

              ].map( handler_class => {
                  const handler = new handler_class();
                  return [ handler.id, handler ];
              })
          );

    const output_handlers =  // handler_type->handler
          Object.fromEntries(
              Object.entries(output_handler_id_to_handler)
                  .map(([handler_id, handler]) => [
                      handler.type,
                      handler,
                  ])
          );


    // === EXPORT ===

    facet_export({
        TEXT_ELEMENT_CLASS,
        clean_for_html,
        output_handler_id_to_handler,
        output_handlers,
    });

} catch (err) { facet_load_error(err, current_script); } })(facet_init());  // facet end
