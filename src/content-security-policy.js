'use strict';

(() => {

    // This code is not a facet.  It is part of the facet bootstrap process.

    // Set a Content Security Policy to allow what we need

    const csp_content = "default-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval' *; img-src 'self' data: blob: *; media-src 'self' data: blob: *";

    globalThis.core.create_child_element(
        document.head, 'meta',
        'http-equiv', "Content-Security-Policy",
        'content',    csp_content,
    );

})();
