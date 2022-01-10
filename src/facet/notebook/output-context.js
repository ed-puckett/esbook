'use strict';

(async ({ current_script, facet, facet_export, facet_load_error }) => { try {  // facet begin

    const {
        output_handlers,
    } = await facet('facet/notebook/output-handlers.js');

    const ie_hide_input_css_class = 'hide-input';

    /** get current "hide input" state for the ie
     *  @param {HTMLElement} interaction element ie
     *  @return {boolean}
     */
    function ie_get_hide_input_state(ie) {
        return ie.classList.contains(ie_hide_input_css_class);
    }

    /** set current "hide input" state for the ie
     *  @param {HTMLElement} interaction element ie
     *  @param {boolean} new "hide input" state for the ie
     */
    function ie_set_hide_input_state(ie, state) {
        if (typeof state !== 'boolean') {
            throw new Error('state must be specified as true or false');
        }
        if (state) {
            ie.classList.add(ie_hide_input_css_class);
        } else {
            ie.classList.remove(ie_hide_input_css_class);
        }
    }

    const ie_is_dialog_css_class = 'is-dialog';

    /** get current "is dialog" state for the ie
     *  @param {HTMLElement} interaction element ie
     *  @return {boolean}
     */
    function ie_get_is_dialog_state(ie) {
        return ie.classList.contains(ie_is_dialog_css_class);
    }

    /** set current "is dialog" state for the ie
     *  @param {HTMLElement} interaction element ie
     *  @param {boolean} new "hide input" state for the ie
     */
    function ie_set_is_dialog_state(ie, state) {
        if (typeof state !== 'boolean') {
            throw new Error('state must be specified as true or false');
        }
        if (state) {
            ie.classList.add(ie_is_dialog_css_class);
        } else {
            ie.classList.remove(ie_is_dialog_css_class);
        }
    }

    function create_output_context(ie, output_data_collection) {
        // Define instance this way to isolate references to notebook,
        // ie and output_data_collection.

        // Note that the output_data_collection is queried now so that
        // if it changes, this output context will only affect the original
        // one.
        const output_element_collection = ie.querySelector('.output');

        return {
            /** get current "hide input" state for the ie
             *  @return {boolean}
             */
            get_hide_input_state() {
                return ie_get_hide_input_state(ie);
            },
            /** set current "hide input" state for the ie
             *  @param {boolean} new "hide input" state for the ie
             */
            set_hide_input_state(state) {
                ie_set_hide_input_state(ie, state);
            },

            /** get current "is dialog" state for the ie
             *  @return {boolean}
             */
            get_is_dialog_state() {
                return ie_get_is_dialog_state(ie);
            },
            /** set current "is dialog" state for the ie
             *  @param {boolean} new "hide input" state for the ie
             */
            set_is_dialog_state(state) {
                ie_set_is_dialog_state(ie, state);
            },

            async output_handler_update_notebook(type, value) {
                const handler = output_handlers[type];
                if (!handler) {
                    throw new Error(`unknown output type: ${type}`);
                } else {
                    await handler.update_notebook(this, value);
                }                    
            },

            validate_size_config(size_config) {
                if ( !Array.isArray(size_config) ||
                     size_config.length !== 2 ||
                     typeof size_config[0] !== 'number' ||
                     typeof size_config[1] !== 'number' ) {
                    throw new Error('size_config must be an array containing two numbers');
                }
            },

            parse_graphics_args(args, error_message) {
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
                    this.validate_size_config(size_config);
                }
                if (config === null || typeof config !== 'object') {
                    throw new Error('config must be a non-null object');
                }
                return [ size_config, config ];
            },

            /** create a new element in the output section of the ie
             *  @param {Object|undefined|null} options: {
             *             size_config?: [width: number, height: number],
             *             tag?: string,                      // tag name for element; default: 'div'
             *             element_namespace?: string,        // namespace for element creation
             *             attrs?: object,                    // attributes to set on element
             *             child_tag?: string,                // if given, create and return a child element
             *             child_element_namespace?: string,  // namespace for child element creation
             *             child_attrs?: object,              // attributes to set on child element
             *         }
             * An randomly-generated id will be assigned to the element (and
             * also to the child element, if one is created) unless those
             * elements have an id attribute specified (in *_attrs).
             */
            create_output_element(options) {
                const {
                    size_config,
                    tag = 'div',
                    element_namespace,
                    attrs,
                    child_tag,
                    child_element_namespace,
                    child_attrs,
                } = (options ?? {});

                // Re: Chart.js:
                // Wrap the canvas element in a div to prevent quirky behavious of Chart.js size handling.
                // See: https://stackoverflow.com/questions/19847582/chart-js-canvas-resize.
                // (Note: doing this for all text/graphics types)
                let output_element;
                if (element_namespace) {
                    output_element = document.createElementNS(element_namespace, tag);
                } else {
                    output_element = document.createElement(tag);
                }
                let output_element_id_specified = false;
                if (attrs) {
                    for (const k in attrs) {
                        const v = attrs[k];
                        output_element.setAttribute(k, v);
                        if (k == 'id') {
                            output_element_id_specified = true;
                        }
                    }
                }
                if (!output_element_id_specified) {
                    output_element.id = globalThis.core.generate_object_id();
                }
                output_element_collection.appendChild(output_element);
                let child;
                if (child_tag) {
                    if (child_element_namespace) {
                        child = document.createElementNS(child_element_namespace, child_tag);
                    } else {
                        child = document.createElement(child_tag);
                    }
                    let child_id_specified = false;
                    if (child_attrs) {
                        for (const k in child_attrs) {
                            const v = child_attrs[k];
                            child.setAttribute(k, v);
                            if (k == 'id') {
                                child_id_specified = true;
                            }
                        }
                    }
                    if (!child_id_specified) {
                        child.id = globalThis.core.generate_object_id();
                    }
                }
                if (size_config) {
                    const [ width, height ] = size_config;
                    if (typeof width === 'number') {
                        output_element.width = width;
                        output_element.style.width = `${width}px`;
                    }
                    if (typeof height === 'number') {
                        output_element.height = height;
                        output_element.style.height = `${height}px`;
                    }
                    if (child) {
                        if (typeof width === 'number') {
                            child.width = width;
                        }
                        if (typeof height === 'number') {
                            child.height = height;
                        }
                    }
                }
                if (child) {
                    output_element.appendChild(child);
                }
                return child ? child : output_element;
            },

            /** create a new canvas element in the output section of the ie
             *  @param {number} width
             *  @param {number} height
             *  @return {HTMLCanvasElement} canvas element with a <div> parent
             */
            create_canvas_output_element(width, height) {
                return this.create_output_element({
                    size_config: [width, height],
                    child_tag: 'canvas',
                });
            },

            // Also creates the output element (via static_element_generator()).
            // If type === 'text', then the text may be merged into the previous element if
            // the previous element was also of type 'text'.
            // Note: static_element_generator() is assumed to always return an element.
            async create_text_output_data(type, text, static_element_generator, leave_scroll_position_alone=false) {
                // try to merge
                if (type === 'text') {
                    // may coalesce with previous element if it is also a text type element
                    const previous_output_data = output_data_collection[output_data_collection.length-1];
                    if (previous_output_data?.type === 'text') {
                        // new data and the previous are both 'text'; merge new data into previous
                        previous_output_data.text += text;
                        // connect output_data and output_element into notebook and ui
                        const merged_output_element = await static_element_generator(previous_output_data);
                        merged_output_element.id = output_element_collection.lastChild.id;  // preserve id
                        output_element_collection.lastChild.replaceWith(merged_output_element);
                        return;
                    }
                }

                // if we get here, we were not able to merge
                const output_data = {
                    type,
                    text,
                };
                const output_element = await static_element_generator(output_data);
                // connect output_data and output_element into notebook and ui
                output_element_collection.appendChild(output_element);
                output_data_collection.push(output_data);
                if (!leave_scroll_position_alone) {
                    this.scroll_output_into_view();
                }
                return output_data;
            },

            async create_generic_graphics_output_data(type, props, leave_scroll_position_alone=false) {
                props = props ?? {};
                if (typeof props.image_uri !== 'string') {
                    throw new Error('output_data must have an image_uri property which is a string');
                }
                const output_data = {
                    type,
                    ...props,
                };
                output_data_collection.push(output_data);
                if (!leave_scroll_position_alone) {
                    this.scroll_output_into_view();
                }
                return output_data;
            },

            async create_canvas_output_data(type, canvas, leave_scroll_position_alone=false) {
                // Save an image of the rendered canvas.  This will be used if this
                // notebook is saved and then loaded again later.
                // Note: using image/png because image/jpeg fails on Firefox (as of writing)
                const image_format = 'image/png';
                const image_format_quality = 1.0;
                const image_uri = canvas.toDataURL(image_format, image_format_quality);
                return this.create_generic_graphics_output_data(type, {
                    image_format,
                    image_format_quality,
                    image_uri,
                }, leave_scroll_position_alone);
            },

            async create_svg_output_data(type, svg, leave_scroll_position_alone=false) {
                // Save an image of the rendered canvas.  This will be used if this
                // notebook is saved and then loaded again later.
                const css = svg_image_util.get_all_css_with_selector_prefix('svg.dagre');//!!! 'svg.dagre' should not be hard-coded here
                const svg_string = svg_image_util.getSVGString(svg, css);
                const width  = svg.clientWidth;
                const height = svg.clientHeight;
                const image_format = 'image/svg+xml';
                const image_uri = `data:${image_format};utf8,${encodeURIComponent(svg_string)}`;
                // The width and height are necessary because when we load this later (using the svg data uri)
                // the image width and height will not be set (as opposed to a png data uri which encodes
                // the width and height in its content).
                return this.create_generic_graphics_output_data(type, {
                    width,
                    height,
                    image_format,
                    image_uri,
                }, leave_scroll_position_alone);
            },

            /** scroll output section of ie into view
             */
            scroll_output_into_view() {
                const interaction_area = document.getElementById('interaction_area');
                const ia_rect = interaction_area.getBoundingClientRect();
                const ie_rect = ie.getBoundingClientRect();
                if (ie_rect.bottom > ia_rect.bottom) {
                    interaction_area.scrollBy(0, (ie_rect.bottom - ia_rect.bottom));
                }
            },
        };
    }


    facet_export({
        ie_hide_input_css_class,
        ie_get_hide_input_state,
        ie_set_hide_input_state,
        ie_is_dialog_css_class,
        ie_get_is_dialog_state,
        ie_set_is_dialog_state,
        create_output_context,
    });

} catch (err) { facet_load_error(err, current_script); } })(globalThis.core.facet_init());  // facet end
