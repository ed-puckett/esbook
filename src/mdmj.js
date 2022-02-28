const {
    create_inline_script,
    load_script,
    load_script_and_wait_for_condition,
} = await import('./dom-util.js');

const mathjax_static_config_identifying_property = 'this_is_initial_static_data';

const mathjax_static_config_js = `
'use strict';

// MathJax static configuration.
// This must be called before the MathJax code is loaded.
// See: https://docs.mathjax.org/en/v2.7-latest/config-files.html#the-tex-mml-am-chtml-configuration-file
// See: Davide Cervone comment in https://groups.google.com/g/mathjax-users/c/5h-NNba8pN4?pli=1 re: "matchFontHeight: false" setting
//      (this is to eliminate the "font-size: 121%" css setting on MathJax blocks).
globalThis.MathJax = {
    jax: [
        "input/TeX",
        "input/MathML",
        "input/AsciiMath",
        "output/CommonHTML",
    ],
    extensions: [
        "tex2jax.js",
        "mml2jax.js",
        "MathMenu.js",
        "MathZoom.js",
        "TeX/AMSmath.js",
        "TeX/AMSsymbols.js",
        "TeX/AMScd.js",
        //"AssistiveMML.js",
        "a11y/accessibility-menu.js",
    ],
    "HTML-CSS": {
        xscale: 100,
        matchFontHeight: false,
    },
    CommonHTML: {
        matchFontHeight: false,
    },
    SVG: {
        matchFontHeight: false,
    },
    tex2jax: {
        inlineMath: [ ['$','$'] ],
        processEscapes: true,
    },
    showMathMenu: true,
    displayAlign: 'left',
    displayIndent: '0em',
    skipStartupTypeset: true,  // typeset must be performed explicitly
    ${mathjax_static_config_identifying_property}: true,  // used to detect when MathJax has replaced this initialization object with itself
};
`;
create_inline_script(document.head, mathjax_static_config_js);

await load_script(document.head, new URL('../node_modules/marked/marked.min.js', import.meta.url));
await load_script_and_wait_for_condition(document.head, new URL('../node_modules/mathjax/latest.js', import.meta.url), () => {
        return !globalThis.MathJax[mathjax_static_config_identifying_property];
    });

export const marked  = globalThis.marked.marked;
export const MathJax = globalThis.MathJax;

// We are currently using MathJax v2.7.x instead of v3.x.x because
// Plotly (used as an output handler) still requires the older version.
// We want to upgrade to MathJax 3.x when Plotly supports it.
export const is_MathJax_v2 = !MathJax.startup;  // MathJax.startup is not defined before version 3
