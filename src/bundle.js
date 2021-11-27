'use strict';

const { sha224, sha256 } = require('js-sha256');
globalThis.sha224 = sha224;
globalThis.sha256 = sha256;

const { v4: uuidv4 } = require('uuid');
globalThis.uuidv4 = uuidv4;

globalThis.generate_object_id = function generate_object_id() {
    // html element ids cannot start with a number
    // (if it does, document.querySelector throws error: '... is not a valid selector')
    return `id-${uuidv4()}`;
}

globalThis.generate_uuid = function generate_uuid() {
    return uuidv4();
}

/** append_element(tag_name, options)
 * @param tag_name: string
 * @param options: undefined | {
 *     parent?: HTMLElement || document.body,
 *     attributes: ( string, string|undefined )*,
 * }
 * @returns the new element
 */
globalThis.append_element = function append_element(tag_name, options) {
    if (!tag_name || typeof tag_name !== 'string') {
        throw new Error('tag_name must be a non-empty string');
    }
    options = options ?? {};
    const el = document.createElement(tag_name);
    if (options.attributes) {
        for (let i = 0; i < options.attributes.length; ) {
            const name  = options.attributes[i++];
            let   value = options.attributes[i++];
            if (typeof value === 'undefined') {
                value = '';
            }
            el.setAttribute(name, value);
        }
    }
    const parent = options.parent ?? document.body;
    parent.appendChild(el);
    return el;
}

append_element('meta', {
    attributes: [
        'http-equiv', "Content-Security-Policy",
        'content',    "default-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline' blob: *; img-src 'self' data: blob: *",
    ],
    parent: document.head,
});

globalThis.facet_export_event_name = 'facet_export';

(() => {
    const facet_promise_data = {};

    globalThis.get_facet = async function get_facet(facet_path) {
        const facet_url = new URL(facet_path, location);
        if (! (facet_url in facet_promise_data)) {
            const promise_data = {};
            promise_data.promise = new Promise(resolve => {
                promise_data.resolve = resolve;
            });
            facet_promise_data[facet_url] = promise_data;
            const script_el = append_element('script', {
                attributes: [
                    'src', facet_url,
                ],
                parent: document.head,
            });
            function facet_export_event_listener(event) {
console.log('>>> facet_export_event_listener', event);//!!!
                if (promise_data.resolve) {
                    promise_data.resolve(event.exports);
                    promise_data.resolve = undefined;
                }
                script_el.removeEventListener(facet_export_event_name, facet_export_event_listener);
            }
            script_el.addEventListener(facet_export_event_name, facet_export_event_listener);
        }
        return facet_promise_data[facet_url].promise;
    }
})();

globalThis.facet_export = function facet_export(exports) {
    const event = new Event(facet_export_event_name);
    event.exports = exports;
    document.currentScript.dispatchEvent(event);
}
