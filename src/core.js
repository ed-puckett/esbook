'use strict';

// This code is not a facet.  It is part of the facet bootstrap process.

(() => {

    /** esbook_ready
     *  A promise that will resolve when initial facets have been loaded
     */
    let _resolve_esbook_ready, _reject_esbook_ready;
    globalThis.esbook_ready = new Promise((resolve, reject) => {
        _resolve_esbook_ready = resolve;
        _reject_esbook_ready  = reject;
    });


    // === ELEMENT CREATION ===

    /** create_element(tag_name, ...attribute_pairs)
     *  @param {string} tag_name
     *  @param {string[]} attribute_pairs pairs of strings: attribute_name, value
     *  @return {Element} the new element
     */
    globalThis.create_element = function create_element(tag_name, ...attribute_pairs) {
        if (typeof tag_name !== 'string' || tag_name.length <= 0) {
            throw new Error('tag_name must be a non-empty string');
        }
        const el = document.createElement(tag_name);
        for (let i = 0; i < attribute_pairs.length; ) {
            const name  = attribute_pairs[i++];
            let   value = attribute_pairs[i++];
            if (typeof value === 'undefined') {
                value = '';
            }
            el.setAttribute(name, value);
        }
        return el;
    };

    /** create_child_element(parent, tag_name, ...attribute_pairs)
     *  @param {Element} parent
     *  @param {string} tag_name
     *  @param {string[]} attribute_pairs pairs of strings: attribute_name, value
     *  @return {Element} the new element
     */
    globalThis.create_child_element = function create_child_element(parent, tag_name, ...attribute_pairs) {
        if (typeof parent !== 'object' || !(parent instanceof Element)) {
            throw new Error('parent must be an Element');
        }
        const el = create_element(tag_name, ...attribute_pairs);
        parent.appendChild(el);
        return el;
    };

    /** create_inline_stylesheet(stylesheet_text)
     *  @param {string} stylesheet_text
     *  @return {HTMLStyleElement} the new <style> element
     */
    globalThis.create_inline_stylesheet = function create_inline_stylesheet(stylesheet_text) {
        const style_el = create_element('style');
        style_el.appendChild(document.createTextNode(stylesheet_text));
        document.head.appendChild(style_el);
        return style_el;
    }


    // === FACETS ===

    // Set Content Security Policy to allow what we need
    create_child_element(document.head, 'meta',
        'http-equiv', "Content-Security-Policy",
        'content',    "default-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline' blob: *; img-src 'self' data: blob: *",
    );

    class FacetExportEvent extends Event {
        static event_name = 'facet_export';

        constructor(error, data) {
            super(FacetExportEvent.event_name);
            this._facet_export_error = error;
            this._facet_export_data  = data;
        }

        get facet_export_error (){ return this._facet_export_error; }
        get facet_export_data  (){ return this._facet_export_data; }
    };

    const facet_promise_data = {};  // map: url -> { promise?: Promise, resolve?: any=>void }

    /** facet(facet_path)
     *  @param {string} facet_path path or url to code for facet
     *  @return {Promise}
     *  The returned promise will resolve asynchronously to the data passed
     *  to facet_export() called within the facet code.
     *  The facet will be loaded via a script tag,
     *  and that script tag will have the defer attribute set.
     */
    globalThis.facet = async function facet(facet_path, base_url=location) {
        const facet_url = new URL(facet_path, base_url);
        // establish_promise() returns true iff the promise was not already created
        function establish_promise() {
            if (facet_promise_data[facet_url]) {
                return false;
            } else {
                const promise_data = {};
                promise_data.promise = new Promise((resolve, reject) => {
                    promise_data.resolve = resolve;
                    promise_data.reject  = reject;
                });
                facet_promise_data[facet_url] = promise_data;
                return true;
            }
        }
        if (establish_promise()) {
            const script_el = create_child_element(
                document.head, 'script',
                'src', facet_url,
                'defer', undefined,
            );
            function handle_facet_export_event(event) {
                const promise_data = facet_promise_data[facet_url];
                if (promise_data) {
                    const err = event.facet_export_error;
                    if (err) {
                        promise_data.reject?.(err);
                        // undo state so it is possible to try again
                        facet_promise_data[facet_url] = undefined;
                        document.head.removeChild(script_el);
                    } else {
                        // non-error data export
                        promise_data.resolve?.(event.facet_export_data);
                        // script_el and facet_promise_data[facet_url] remain
                    }
                    // avoid further resolve/reject of promise
                    promise_data.resolve = undefined;
                    promise_data.reject  = undefined;
                }
                // remove other listener
                script_el.removeEventListener('error', handle_facet_script_error);
            }
            function handle_facet_script_error(event) {
                const promise_data = facet_promise_data[facet_url];
                if (promise_data) {
                    promise_data.reject(new Error(`failed to load facet script: ${facet_url}`));
                    // avoid further resolve/reject of promise
                    promise_data.resolve = undefined;
                    promise_data.reject  = undefined;
                }
                // remove other listener
                script_el.removeEventListener(FacetExportEvent.event_name, handle_facet_export_event);
            }
            script_el.addEventListener(FacetExportEvent.event_name, handle_facet_export_event, { once: true });
            script_el.addEventListener('error', handle_facet_script_error, { once: true });
        }
        return facet_promise_data[facet_url].promise;
    }

    /** facet_export(export_data)
     *  @param {any} export_data
     *  Exports data from a facet.
     *  To be called from a facet.
     *  To be called at most once.
     *  The promise returned from facet() will resolve to export_data.
     */
    globalThis.facet_export = function facet_export(export_data) {
        const event = new FacetExportEvent(null, export_data);
        document.currentScript.dispatchEvent(event);
    };

    /** facet_load_error(err)
     *  @param {Error} err
     *  To be called from a facet.
     *  To be called at most once.
     *  Reverts the modifications to the current document that were
     *  directly caused by facet() to be undone and causes
     *  the promise that was returned from facet() to reject.
     */
    globalThis.facet_load_error = function facet_load_error(err) {
        const event = new FacetExportEvent(err);
        document.currentScript.dispatchEvent(event);
    };

    /** async function load_and_wait_for_script(parent, script_url, poll_fn)
     *  @param {Node} parent the parent element for script
     *  @param {string} script_url url of script to load (the script tag will be created without defer or async attributes)
     *  @param {() => boolean} poll_fn function that will return true when script has loaded
     *  @return {Promise}
     */
    globalThis.load_and_wait_for_script = async function load_and_wait_for_script(parent, script_url, poll_fn) {
        return new Promise((resolve, reject) => {
            let script_el;
            let wait_timer_id;
            function script_load_error_handler(event) {
                if (reject) {
                    reject(new Error(`error loading script ${script_url}`));
                }
                reset();
            }
            function wait() {
                if (poll_fn()) {
                    resolve?.();
                    reset();
                } else {
                    wait_timer_id = setTimeout(wait);  // check again on next tick
                }
            }
            function reset() {
                if (typeof wait_timer_id !== 'undefined') {
                    clearTimeout(wait_timer_id);
                    wait_timer_id = undefined;
                }
                if (script_el) {
                    script_el.removeEventListener('error', script_load_error_handler);
                }
                resolve = undefined;
                reject  = undefined;
            }
            try {
                script_el = create_child_element(parent, 'script', 'src', script_url);
                script_el.addEventListener('error', script_load_error_handler, { once: true });
                wait();
            } catch (err) {
                reject?.(err);
                reset();
            }
        });
    }


    // === LOAD CORE PACKAGE BUNDLE AND CORE FACETS ===

    const cpb_url = new URL('../build/core-package-bundle.js', document.currentScript.src);
    const cpb_loaded = () => globalThis.uuidv4;  // core-package-bundle.js sets globalThis.uuidv4, amongst other things

    const lcf_url = new URL('./load-core-facets.js', document.currentScript.src);
    const lcf_loaded = () => globalThis.load_core_facets_result;  // load-core-facets.js sets globalThis.load_core_facets_result

    load_and_wait_for_script(document.head, cpb_url, cpb_loaded)
        .then(() => load_and_wait_for_script(document.head, lcf_url, lcf_loaded))
        .then(() => {
            if (globalThis.load_core_facets_result instanceof Error) {
                _reject_esbook_ready(globalThis.load_core_facets_result);
            } else {
                _resolve_esbook_ready();
            }
        })
        .catch(err => _reject_esbook_ready(err))
        .then(
            () => {
                _resolve_esbook_ready = undefined;
                _reject_esbook_ready  = undefined;
            } );
})();
