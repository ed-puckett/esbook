'use strict';

// This code is not a facet.  It is part of the facet bootstrap process.

(() => {

    globalThis.core = globalThis.core ?? {};

    const core_script = document.currentScript;


    /** a Promise-like object with its resolve and reject methods exposed externally
     */
    globalThis.core.OpenPromise = class OpenPromise {
        constructor() {
            let resolve, reject;
            const promise = new Promise((o, x) => { resolve = o; reject = x; });
            Object.defineProperties(this, {
                promise: {
                    value: promise,
                },
                resolve: {
                    value: resolve,
                },
                reject: {
                    value: reject,
                },
                then: {
                    value: promise.then.bind(promise),
                },
                catch: {
                    value: promise.catch.bind(promise),
                },
                finally: {
                    value: promise.finally.bind(promise),
                },
            });
        }

        async await() { return await this.promise; }
    }

    /** esbook_ready
     *  A promise that will resolve when initial facets have been loaded
     */
    let _resolve_esbook_ready, _reject_esbook_ready;
    globalThis.core.esbook_ready = new Promise((resolve, reject) => {
        _resolve_esbook_ready = resolve;
        _reject_esbook_ready  = reject;
    });


    // === ELEMENT CREATION ===

    /** create_element(tag_name, ...attribute_pairs)
     *  @param {string} tag_name
     *  @param {string[]} attribute_pairs pairs of strings: attribute_name, value
     *  @return {Element} the new element
     */
    globalThis.core.create_element = function create_element(tag_name, ...attribute_pairs) {
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
    globalThis.core.create_child_element = function create_child_element(parent, tag_name, ...attribute_pairs) {
        if (typeof parent !== 'object' || !(parent instanceof Element)) {
            throw new Error('parent must be an Element');
        }
        const el = globalThis.core.create_element(tag_name, ...attribute_pairs);
        parent.appendChild(el);
        return el;
    };

    /** create_stylesheet(parent, stylesheet_url, ...attribute_pairs)
     *  @param {Element} parent
     *  @param {string} stylesheet_url
     *  @param {string[]} attribute_pairs pairs of strings: attribute_name, value
     *  @return {HTMLStyleElement} the new <style> element
     */
    globalThis.core.create_stylesheet = function create_stylesheet(parent, stylesheet_url, ...attribute_pairs) {
        return globalThis.core.create_child_element(
            parent,
            'link',
            'rel', "stylesheet",
            'href', stylesheet_url,
            ...attribute_pairs );
    }

    /** create_inline_stylesheet(parent, stylesheet_text, ...attribute_pairs)
     *  @param {Element} parent
     *  @param {string} stylesheet_text
     *  @param {string[]} attribute_pairs pairs of strings: attribute_name, value
     *  @return {HTMLStyleElement} the new <style> element
     */
    globalThis.core.create_inline_stylesheet = function create_inline_stylesheet(parent, stylesheet_text, ...attribute_pairs) {
        const style_el = globalThis.core.create_element('style', ...attribute_pairs);
        style_el.appendChild(document.createTextNode(stylesheet_text));
        parent.appendChild(style_el);
        return style_el;
    }

    /** create_script(parent, script_url, ...attribute_pairs)
     *  @param {Element} parent
     *  @param {string} script_url
     *  @param {string[]} attribute_pairs pairs of strings: attribute_name, value
     *  @return {HTMLStyleElement} the new <style> element
     */
    globalThis.core.create_script = function create_script(parent, script_url, ...attribute_pairs) {
        return globalThis.core.create_child_element(
            parent,
            'script',
            'src', script_url,
            ...attribute_pairs );
    }

    /** create_inline_script(parent, script_text, ...attribute_pairs)
     *  @param {Element} parent
     *  @param {string} script_text
     *  @param {string[]} attribute_pairs pairs of strings: attribute_name, value
     *  @return {HTMLScriptElement} the new <script> element
     */
    globalThis.core.create_inline_script = function create_inline_script(parent, script_text, ...attribute_pairs) {
        const script_el = globalThis.core.create_element('script', ...attribute_pairs);
        script_el.appendChild(document.createTextNode(script_text));
        parent.appendChild(script_el);
        return script_el;
    }


    // === SCRIPTS ===

    const script_promise_data = {};  // map: url -> { promise?: Promise, resolve?: any=>void, reject?: any=>void }

    // establish_script_promise_data(script_url) returns
    // { promise_data, initial } where promise_data is
    // script_promise_data[script_url] and initial is true
    // iff the promise was newly created.
    function establish_script_promise_data(full_script_url) {
        const data_key = full_script_url.toString();
        let promise_data = script_promise_data[data_key];
        let initial;
        if (promise_data) {
            initial = false;
        } else {
            promise_data = {};
            promise_data.promise = new Promise((resolve, reject) => {
                promise_data.resolve = resolve;
                promise_data.reject  = reject;
            });
            script_promise_data[data_key] = promise_data;
            initial = true;
        }
        return { initial, promise_data };
    }

    /** async function load_script(parent, script_url)
     *  @param {Node} parent the parent element for script
     *  @param {string} script_url url of script to load (the script tag will be created without defer or async attributes)
     *  @return {Promise}
     *  Use this to load a script and wait for its 'load' event.
     *  Only the first invokation for a particular script_url will create
     *  the script element.  Others will simply wait for the script to load
     *  or for error.
     */
    globalThis.core.load_script = async function load_script(parent, script_url) {
        const full_script_url = new URL(script_url, core_script.src);
        const { promise_data, initial } = establish_script_promise_data(full_script_url);
        if (initial) {
            let script_el;
            function script_load_handler(event) {
                promise_data.resolve?.();
                reset();
            }
            function script_load_error_handler(event) {
                promise_data.reject?.(new Error(`error loading script ${full_script_url}`));
                reset();
            }
            function reset() {
                if (script_el) {
                    script_el.removeEventListener('load',  script_load_handler);
                    script_el.removeEventListener('error', script_load_error_handler);
                }
                promise_data.resolve = undefined;
                promise_data.reject  = undefined;
            }
            try {
                script_el = globalThis.core.create_script(parent, full_script_url);
                script_el.addEventListener('load',  script_load_handler,       { once: true });
                script_el.addEventListener('error', script_load_error_handler, { once: true });
            } catch (err) {
                promise_data.reject?.(err);
                reset();
            }
        }
        return promise_data.promise;
    }

    /** async function load_script_and_wait_for_condition(parent, script_url, condition_poll_fn)
     *  @param {Node} parent the parent element for script
     *  @param {string} script_url url of script to load (the script tag will be created without defer or async attributes)
     *  @param {() => boolean} condition_poll_fn function that will return true when script has loaded
     *  @return {Promise}
     *  Use this to load a script where you want to poll for condition
     *  that will be triggered asynchronously by the script, in which
     *  case waiting for the load event will not work because it fires
     *  when script execution completes but not when some later condition
     *  is triggered asynchronously by the script.
     *  Only the first invokation for a particular script_url will create
     *  the script element.  Others will simply wait for the script to load
     *  or for error.
     */
    globalThis.core.load_script_and_wait_for_condition = async function load_script_and_wait_for_condition(parent, script_url, condition_poll_fn) {
        const full_script_url = new URL(script_url, core_script.src);
        const { promise_data, initial } = establish_script_promise_data(full_script_url);
        if (initial) {
            let script_el;
            let wait_timer_id;
            function script_load_error_handler(event) {
                promise_data.reject?.(new Error(`error loading script ${full_script_url}`));
                reset();
            }
            function wait() {
                if (condition_poll_fn()) {
                    promise_data.resolve?.();
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
                promise_data.resolve = undefined;
                promise_data.reject  = undefined;
            }
            try {
                script_el = globalThis.core.create_script(parent, full_script_url);
                script_el.addEventListener('error', script_load_error_handler, { once: true });
                wait();
            } catch (err) {
                promise_data.reject?.(err);
                reset();
            }
        }
        return promise_data.promise;
    }


    // === FACETS ===

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

    const facet_promise_data = {};  // map: url -> { promise?: Promise, resolve?: any=>void, reject?: any=>void }

    // establish_facet_promise_data(facet_url) returns
    // { promise_data, initial } where promise_data is
    // facet_promise_data[facet_url] and initial is true
    // iff the promise was newly created.
    function establish_facet_promise_data(full_facet_url) {
        const data_key = full_facet_url.toString();
        let promise_data = facet_promise_data[data_key];
        let initial;
        if (promise_data) {
            initial = false;
        } else {
            promise_data = {};
            promise_data.promise = new Promise((resolve, reject) => {
                promise_data.resolve = resolve;
                promise_data.reject  = reject;
            });
            facet_promise_data[data_key] = promise_data;
            initial = true;
        }
        return { initial, promise_data };
    }

    /** facet(facet_url)
     *  @param {string} url to code for facet
     *  @return {Promise}
     *  The returned promise will resolve asynchronously to the data passed
     *  to facet_export() called within the facet code.
     *  The facet will be loaded via a script tag,
     *  and that script tag will have the defer attribute set.
     *  Only the first invokation for a particular facet_url will create
     *  the facet element.  Others will simply wait for the facet to load
     *  or for error.
     */
    globalThis.core.facet = async function facet(facet_url) {
        const full_facet_url = new URL(facet_url, core_script.src);
        const { promise_data, initial } = establish_facet_promise_data(full_facet_url);
        if (initial) {
            const script_el = globalThis.core.create_script(document.head, full_facet_url,
                'defer', undefined,
            );
            function handle_facet_export_event(event) {
                const err = event.facet_export_error;
                if (err) {
                    promise_data.reject?.(err);
                } else {
                    // non-error data export
                    promise_data.resolve?.(event.facet_export_data);
                }
                // avoid further resolve/reject of promise
                promise_data.resolve = undefined;
                promise_data.reject  = undefined;
                // remove other listener
                script_el.removeEventListener('error', handle_facet_script_error);
            }
            function handle_facet_script_error(event) {
                promise_data.reject(new Error(`failed to load facet script: ${full_facet_url}`));
                // avoid further resolve/reject of promise
                promise_data.resolve = undefined;
                promise_data.reject  = undefined;
                // remove other listener
                script_el.removeEventListener(FacetExportEvent.event_name, handle_facet_export_event);
            }
            script_el.addEventListener(FacetExportEvent.event_name, handle_facet_export_event, { once: true });
            script_el.addEventListener('error', handle_facet_script_error, { once: true });
        }
        return promise_data.promise;
    }

    /** facet_export(export_data, target_script=document.currentScript)
     *  @param {any} export_data
     *  @param {EventTarget} target_script (Optional, default document.currentScript) target for export event
     *  Exports data from a facet.
     *  To be called from a facet.
     *  To be called at most once.
     *  Pass target_script when using asynchronously from facet code, passing original value of document.currentScript.
     *  The promise returned from facet() will resolve to export_data.
     */
    globalThis.core.facet_export = function facet_export(export_data, target_script=document.currentScript) {
        const event = new FacetExportEvent(null, export_data);
        target_script.dispatchEvent(event);
    };

    /** facet_load_error(err, target_script=document.currentScript)
     *  @param {Error} err
     *  @param {EventTarget} target_script (Optional, default document.currentScript) target for export event
     *  To be called from a facet.
     *  To be called at most once.
     *  Pass target_script when using asynchronously from facet code, passing original value of document.currentScript.
     *  Reverts the modifications to the current document that were
     *  directly caused by facet() to be undone and causes
     *  the promise that was returned from facet() to reject.
     */
    globalThis.core.facet_load_error = function facet_load_error(err, target_script=document.currentScript) {
        const event = new FacetExportEvent(err);
        target_script.dispatchEvent(event);
    };

    /** facet_init()
     *  @return {{ current_script, facet_export, facet_load_error }}
     *  Returns the current value of document.currentScript (current_script)
     *  and versions of the facet_export() and facet_load_error() functions
     *  with their target_script arguments defaulting to current_script.
     *  This is useful for facet implementations that will ultimately use
     *  the facet_export() and facet_load_error() functions in a context
     *  where document.currentScript is no longer valid.
     */
    globalThis.core.facet_init = function facet_init() {
        const current_script = document.currentScript;
        return {
            current_script,
            facet:            globalThis.core.facet,
            facet_export:     (export_data, target_script=current_script) => globalThis.core.facet_export(export_data, target_script),
            facet_load_error: (err, target_script=current_script) => globalThis.core.facet_load_error(err, target_script),
        };
    };


    // === LOAD CSP, CORE PACKAGE BUNDLE AND CORE FACETS ===

    const csp_url = new URL('./content-security-policy.js', document.currentScript.src);

    const cpb_url = new URL('../build/core-package-bundle.js', document.currentScript.src);

    const lcf_url = new URL('./load-core-facets.js', document.currentScript.src);
    const lcf_loaded = () => globalThis.core.load_core_facets_result;  // load-core-facets.js sets globalThis.core.load_core_facets_result

    globalThis.core.load_script(document.head, csp_url)
        .then(() => globalThis.core.load_script(document.head, cpb_url))
        .then(() => globalThis.core.load_script_and_wait_for_condition(document.head, lcf_url, lcf_loaded))
        .then(() => {
            if (globalThis.core.load_core_facets_result instanceof Error) {
                _reject_esbook_ready(globalThis.core.load_core_facets_result);
            } else {
                _resolve_esbook_ready();
            }
        })
        .catch(err => _reject_esbook_ready(err))
        .finally(
            () => {
                _resolve_esbook_ready = undefined;
                _reject_esbook_ready  = undefined;
                Object.freeze(globalThis.core);
        } );
})();
