// WHY IS THIS FILE SO MESSY?
// --------------------------
// This file has a ".mjs" extension because it is intended to be import-able
// from nodejs as well as the notebook code.  This is to support building
// demos from the examples from the Makefile.
//
// Also: the definition of make_string_literal is repeated here to avoid
//  problems with importing "../dom-util.js".
//
// A nodejs implementation of btoa() is used if globalThis.btoa is not defined.

function make_string_literal(s) {
    return `'${[ ...s ].map(s => s === "'" ? "\\'" : s).join('')}'`;
}

let btoa = globalThis.btoa;
if (typeof btoa !== 'function') {
    // for nodejs
    btoa = (b) => Buffer.from(b).toString('base64');
}

export function create_exported_notebook(contents_json, document_title, default_server_endpoint) {
    if (typeof contents_json !== 'string') {
        throw new Error('contents_json must be a string');
    }
    if (typeof document_title !== 'string') {
        throw new Error('document_title must be a string');
    }
    if (typeof default_server_endpoint !== 'string' && !(default_server_endpoint instanceof URL)) {
        throw new Error('default_server_endpoint must be a string or an instance of URL');
    }
    default_server_endpoint = default_server_endpoint.toString();
    const contents_base64 = btoa(contents_json);
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>${document_title}</title>
    <script defer type="module">
        const default_server_endpoint = ${make_string_literal(default_server_endpoint)};
        const server_endpoint = new URL(location).searchParams.get('s') ?? default_server_endpoint;
        const loading_indicator_el = document.createElement('h1');
        loading_indicator_el.innerText = 'Loading...';
        document.body.insertBefore(loading_indicator_el, document.body.firstChild);
        try {
            await import(new URL('./src/init.js', server_endpoint));
        } catch (error) {
            document.body.innerHTML = '<h1>Failed to Load</h1><h2>Server endpoint: '+server_endpoint+'</h2><pre>'+error.stack+'</pre>';
        } finally {
            loading_indicator_el.remove();
        }
    </script>
</head>
<body>
<div id="initializing-data-f55c8878-87c8-11ec-b7c3-273bd5f809b1" style="display:none">
${contents_base64}
</div>
</body>
</html>
`;
}
