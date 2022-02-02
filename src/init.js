const {
    show_initialization_failed,
    create_child_element,
} = await import('./dom-util.js');

try {  // catch and handle any errors during initialization

    // === CONTENT SECURITY POLICY ===

    const csp_content = "default-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval' *; img-src 'self' data: blob: *; media-src 'self' data: blob: *; connect-src data:";

    create_child_element(document.head, 'meta', {
        "http-equiv": "Content-Security-Policy",
        "content":    csp_content,
    });


    // === LOAD CORE MODULES ===

    const nb_url  = new URL('./notebook.js', import.meta.url);
    await import(nb_url);

} catch (error) {

    show_initialization_failed(error);

}
