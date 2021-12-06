'use strict';

// This is a facet

(async () => {
    // need to capture for for calling facet_export() and facet_load_error() later asynchronously:
    const current_script = document.currentScript;

    try {

        const mathjax_static_config_js = `
'use strict';

// MathJax static configuration.
// This must be called before the MathJax code is loaded.
// See: https://docs.mathjax.org/en/v2.7-latest/config-files.html#the-tex-mml-am-chtml-configuration-file
window.MathJax = {
    jax: ["input/TeX","input/MathML","input/AsciiMath","output/CommonHTML"],
    extensions: ["tex2jax.js","mml2jax.js","asciimath2jax.js","MathMenu.js","MathZoom.js"/*,"AssistiveMML.js"*/, "a11y/accessibility-menu.js"],
    TeX: {
        extensions: ["AMSmath.js","AMSsymbols.js","noErrors.js","noUndefined.js"]
    },
    tex2jax: {
        inlineMath: [ ['$','$'] ],
        processEscapes: true,
    },
    displayAlign: 'left',
    displayIndent: '0',
    skipStartupTypeset: true,  // typeset must be performed explicitly
};
`;
        create_inline_script(document.head, mathjax_static_config_js);

        const export_data = await Promise.all([
            load_script(document.head, new URL('../../node_modules/marked/marked.min.js', current_script.src)),
            load_script(document.head, new URL('../../node_modules/mathjax/latest.js',    current_script.src)),
        ])
              .then(() => {
                  // We are currently using MathJax v2.7.x instead of v3.x.x because
                  // Plotly (used as an output handler) still requires the older version.
                  // We want to upgrade to MathJax 3.x when Plotly supports it.
                  const is_MathJax_v2 = !MathJax.startup;  // Mathjax.startup is not defined before version 3
                  const export_data = {
                      marked,
                      is_MathJax_v2,
                      MathJax,
                  };
                  return is_MathJax_v2
                      ? export_data
                      : MathJax.startup.promise.then(() => export_data);
              });

        facet_export(export_data, current_script);

    } catch (err) {
        facet_load_error(err, current_script);
    }
})();
