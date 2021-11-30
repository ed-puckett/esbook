'use strict';

// This code is not a facet.  It bootstraps use of facets.

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
     *  @param tag_name: string
     *  @param attribute_pairs: string[]  // pairs of strings: attribute_name, value
     *  @returns the new element
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
     *  @param parent: Element
     *  @param tag_name: string
     *  @param attribute_pairs: string[]  // pairs of strings: attribute_name, value
     *  @returns the new element
     */
    globalThis.create_child_element = function create_child_element(parent, tag_name, ...attribute_pairs) {
        if (typeof parent !== 'object' || !(parent instanceof Element)) {
            throw new Error('parent must be an Element');
        }
        const el = create_element(tag_name, ...attribute_pairs);
        parent.appendChild(el);
        return el;
    };


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

    /** load_facet(facet_path)
     *  @param facet_path: string  // path or url to code for facet
     *  @returns Promise
     *  The returned promise will resolve asynchronously to the data passed
     *  to facet_export() called within the facet code.
     */
    globalThis.load_facet = async function load_facet(facet_path, base_url=location) {
        const facet_url = new URL(facet_path, base_url);
        if (!facet_promise_data[facet_url]) {
            const promise_data = {};
            promise_data.promise = new Promise((resolve, reject) => {
                promise_data.resolve = resolve;
                promise_data.reject  = reject;
            });
            facet_promise_data[facet_url] = promise_data;
            const script_el = create_child_element(document.head, 'script', 'src', facet_url);
            script_el.addEventListener(FacetExportEvent.event_name, function (event) {
                if (!facet_promise_data[facet_url]) {
                    // avoid subsequent events if an error was signalled
                    return;
                }
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
            }, {
                once: true,
            });
        }
        return facet_promise_data[facet_url].promise;
    }

    /** facet_export(export_data)
     *  @param export_data: any
     *  Exports data from a facet.
     *  To be called from a facet.
     *  To be called at most once.
     *  The promise returned from load_facet() will resolve to export_data.
     */
    globalThis.facet_export = function facet_export(export_data) {
        const event = new FacetExportEvent(null, export_data);
        document.currentScript.dispatchEvent(event);
    };

    /** facet_load_error(err)
     *  @param err: Error
     *  To be called from a facet.
     *  To be called at most once.
     *  Reverts the modifications to the current document that were
     *  directly caused by load_facet() to be undone and causes
     *  the promise that was returned from load_facet() to reject.
     */
    globalThis.facet_load_error = function facet_load_error(err) {
        const event = new FacetExportEvent(err);
        document.currentScript.dispatchEvent(event);
    };


    // === LOAD PACKAGE BUNDLE ===

    const package_bundle_url = new URL('../build/package-bundle.js', document.currentScript.src)
    create_child_element(document.head, 'script', 'src', package_bundle_url);

    // package bundle is not a facet, so wait for it by polling
    function wait_for_package_bundle() {
        // package bundle sets globalThis.uuidv4, amongst other things
        if (!globalThis.uuidv4) {
            setTimeout(wait_for_package_bundle);
        } else {
            load_other_facets();
        }
    }
    wait_for_package_bundle();

    function load_other_facets() {

        // === LOAD OTHER FACETS ===

        Promise.all([
            'facet/message-controller/message-controller.js',
            'facet/settings/settings.js',
            //...
        ].map(p => load_facet(p))).then(
            () => {
                _resolve_esbook_ready();
                _resolve_esbook_ready = undefined;
                _reject_esbook_ready  = undefined;
            },
            err => {
                _reject_esbook_ready(err);
                _resolve_esbook_ready = undefined;
                _reject_esbook_ready  = undefined;
            });
    }
})();
