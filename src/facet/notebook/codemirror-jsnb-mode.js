(function (mod) {
    const require_paths = [
        // CodeMirror:
        '../../node_modules/codemirror/lib/codemirror.js',
        // dependencies:
        '../../node_modules/codemirror/mode/markdown/markdown.js',
        '../../node_modules/codemirror/mode/stex/stex.js',
        '../../node_modules/codemirror/mode/javascript/javascript.js',
    ];
    if (typeof exports === 'object' && typeof module === 'object') {  // CommonJS
        mod(...require_paths.map(path => require(path)));
    } else if (typeof define === 'function' && define.amd) {  // AMD
        define(require_paths, mod);
    } else {  // plain browser env
        mod(CodeMirror);
    }
})(function (CodeMirror) {
    'use strict';

    const token_switch_context = '%%%';//!!!

    const JAVASCRIPT = 'javascript';
    const MARKDOWN   = 'markdown';
    const STEX       = 'stex';

    const mode_change_token_style = 'bracket';

    CodeMirror.defineMode('jsnb', function (config, parser_config) {
        const modes = {
            [JAVASCRIPT]: CodeMirror.getMode(config, {
                name: 'javascript',
            }),
            [MARKDOWN]: CodeMirror.getMode(config, {
                name: 'markdown',
            }),
            [STEX]: CodeMirror.getMode(config, {
                name: 'stex',
            }),
        };

        // This is the implementation of the token() function for the jsnb
        // mode, and also performs state transitions between the inner modes
        // of that mode.
        function token(stream, state) {
            // detect mode change token
            switch (state.current) {
            case JAVASCRIPT: {
                if (stream.sol() && stream.match(token_switch_context)) {
                    state.current = MARKDOWN;
                    return mode_change_token_style;
                }
                // un-consume and fall through to current mode delegation
                stream.backUp(stream.current().length);
                break;
            }
            case MARKDOWN: {
                stream.eatSpace();
                if (stream.sol() && stream.match(token_switch_context)) {
                    state.current = JAVASCRIPT;
                    return mode_change_token_style;
                } else if (stream.match(/^[^\\][$]{2}/)) {
                    state.current = STEX;
                    state.stex_inline = false;
                    return mode_change_token_style;
                } else if (stream.match(/^[^\\][$]{1}/)) {
                    state.current = STEX;
                    state.stex_inline = true;
                    return mode_change_token_style;
                }
                // un-consume and fall through to current mode delegation
                stream.backUp(stream.current().length);
                break;
            }
            case STEX: {
                const end_token = state.stex_inline ? /^[^\\][$]{1}/ : /^[^\\][$]{2}/;
                if (stream.match(end_token)) {
                    state.current = MARKDOWN;
                    return mode_change_token_style;
                }
                // un-consume and fall through to current mode delegation
                stream.backUp(stream.current().length);
                break;
            }
            default:
                throw new Error(`unexpected state.current: ${state.current}`);
            }
            // if no mode change token detected, delegate to current mode
            return modes[state.current].token(stream, state.inner[state.current]);
        }

        return {
            token,  // implemented above

            startState: function () {
                return {
                    current: JAVASCRIPT,  // start in MARKDOWN
                    mode_switch: false,  // true when mode just switched
                    stex_inline: undefined,  // relevant when in STEX; false: $$...$$, true: $...$
                    inner: {
                        [JAVASCRIPT]: CodeMirror.startState(modes[JAVASCRIPT]),
                        [MARKDOWN]:   CodeMirror.startState(modes[MARKDOWN]),
                        [STEX]:       CodeMirror.startState(modes[STEX]),
                    },
                };
            },

            copyState: function (state) {
                const inner = {};
                for (const s in state.inner) {
                    inner[s] = CodeMirror.copyState(modes[s], state.inner[s]);
                }
                return { ...state, inner };
            },

            indent: function (state, text_after, line) {
                const mode = modes[state.current];
                if (mode.indent) {
                    const inner = state.inner[state.current];
                    return mode.indent(inner, text_after, line);
                } else {
                    return CodeMirror.Pass;
                }
            },

            innerMode: function (state) {
                return {
                    mode:  modes[state.current],
                    state: state.inner[state.current],
                };
            }
        };
    });

    CodeMirror.defineMIME('application/x-jsnb', 'jsnb');
});
