'use strict';

(async ({ current_script, facet_export, facet_load_error }) => { try {  // facet begin

    const { beep } = await facet('facet/beep.js');

    const current_event_listeners = new WeakMap();

    function remove_current_key_handler(element) {
        const listener_specs = current_event_listeners[element];
        if (listener_specs) {
            for (const [ type, listener, options ] of listener_specs) {
                element.removeEventListener(type, listener, options);
            }
            current_event_listeners.delete(element);
        }
    }

    // element: an HTML element on which to listen for keyboard events
    // key_bindings: { key_spec: (() => any), ... }
    // options: {
    //     operation_args?: any[],               // default: []
    //     beep?:           (() => any),         // default: beep (imported above)
    //     skip_key_event?: (event) => boolean,  // default: always return false
    // }
    function bind_key_handler(element, key_bindings, options) {
        options = options ?? {};
        const operation_args = options.operation_args ?? [];
        const beep_impl      = options.beep           ?? beep;
        const skip_key_event = options.skip_key_event ?? ((event) => false);

        const initial_state = build_operation_trie(key_bindings);
        let state;
        let key_sequence;
        function reset() {
            state = initial_state;
            key_sequence = [];
        }
        reset();

        const blur_handler = reset;
        const keydown_handler = (event) => {
            if (skip_key_event(event)) {
                reset();
                return;
            }
            switch (event.key) {
            case 'Alt':
            case 'AltGraph':
            case 'CapsLock':
            case 'Control':
            case 'Fn':
            case 'FnLock':
            case 'Hyper':
            case 'Meta':
            case 'NumLock':
            case 'ScrollLock':
            case 'Shift':
            case 'Super':
            case 'Symbol':
            case 'SymbolLock':
            case 'OS':  // Firefox quirk
                // modifier key, ignore
                break;

            default: {
                const key_spec = canonical_key_spec_from_key_and_flags(
                    ...['key', 'ctrlKey', 'altKey', 'shiftKey', 'metaKey'].map(prop => event[prop])
                );
                const next = state[key_spec];
                if (!next) {
                    if (state !== initial_state) {
                        // Beep only if at least one keypress has already been accepted.
                        beep_impl();
                    }
                    reset();
                } else {
                    state = next;
                    key_sequence.push(key_spec);
                    const operation = state[null];
                    if (operation) {
                        try {
                            operation(...operation_args);
                        } catch (err) {
                            console.error(`operation failed for key sequence ${key_sequence.join(' ')}:`, err.stack);
                        }
                        reset();
                    }
                }
            }
            }
        };

        remove_current_key_handler(element);

        const listener_specs = [
            [ 'blur',    blur_handler,    { capture: true } ],
            [ 'keydown', keydown_handler, { capture: true } ],
        ];

        for (const [ type, listener, options ] of listener_specs) {
            element.addEventListener(type, listener, options);
        }
        current_event_listeners[element] = listener_specs;
    }

    function build_operation_trie(key_bindings) {
        const trie = {};
        for (const key_sequence in key_bindings) {
            const operation = key_bindings[key_sequence];
            let state = trie;
            for (const key_spec of key_sequence.trim().split(/\s+/)) {
                const canonical = canonical_key_spec(key_spec);
                let next = state[canonical];
                if (!next) {
                    next = state[canonical] = {};
                }
                state = next;
            }
            state[null] = operation;
        }
        return trie;
    }

    function canonical_key_spec(key_spec) {
        const parts = key_spec.trim().split(/[+-]/);
        const key = parts[parts.length-1];
        const modifiers = {};
        for (let i = 0; i < parts.length-1; i++) {
            const p = parts[i].toLowerCase();
            const pc = p.toLowerCase();
            let m;
            switch (pc) {
            case 'ctrl':
            case 'alt':
            case 'shift':
            case 'meta':
                m = p;
                break;
            default:
                throw new Error(`unrecognized modifier "${p}" specified in key specification ${key_spec}`);
            }
            if (modifiers[m]) {
                throw new Error(`ambiguously-specified modifier "${p}" in key specification ${key_spec}`);
            }
            modifiers[m] = true;
        }
        return canonical_key_spec_from_key_and_flags(
            key,
            ...['ctrl', 'alt', 'shift', 'meta'].map(m => !!modifiers[m])
        );
    }

    function canonical_key_spec_from_key_and_flags(key, ctrl, alt, shift, meta) {
        //!!! what about TAB, SPACE, etc...?
        return `${ctrl ? 'Ctrl-' : ''}${alt ? 'Alt-' : ''}${shift ? 'Shift-' : ''}${meta ? 'Meta-' : ''}${key.toLowerCase()}`
    }

    facet_export({
        remove_current_key_handler,
        bind_key_handler,
    });

} catch (err) { facet_load_error(err, current_script); } })(facet_init());  // facet end
