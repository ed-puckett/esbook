'use strict';

(async ({ current_script, facet_export, facet_load_error }) => { try {  // facet begin

    const { beep } = await facet('facet/beep.js');

    const define_subscribable = await facet('facet/subscribable.js');

    const {
        canonical_key_spec_separator,
        parse_key_spec,
        parse_keyboard_event,
    } = await facet('facet/notebook/key-spec.js');


    // === COMMAND BINDINGS ===

    const initial_command_bindings = {  // command_string->key_bindings_array
        'undo':                 [ 'CmdOrCtrl+Z' ],
        'redo':                 [ 'CmdOrCtrl+Shift+Z' ],
        'clear_notebook':       [ 'CmdOrCtrl+Shift+C' ],
        'open_notebook':        [ 'CmdOrCtrl+O', 'Ctrl-X Ctrl-F' ],
        'import_notebook':      [ 'CmdOrCtrl+Shift+O' ],
        'reopen_notebook':      [ 'CmdOrCtrl+R' ],
        'save_notebook':        [ 'CmdOrCtrl+S' ],
        'save_as_notebook':     [ 'CmdOrCtrl+Shift+S' ],
        'eval_element':         [ 'CmdOrCtrl+Enter' ],
        'eval_stay_element':    [ 'CmdOrCtrl+Shift+Enter' ],
        'eval_notebook':        [ 'CmdOrCtrl+Shift+!' ],
        'eval_notebook_before': [ 'CmdOrCtrl+Shift+Alt+!' ],
        'focus_up_element':     [ 'Alt+Up' ],
        'focus_down_element':   [ 'Alt+Down' ],
        'move_up_element':      [ 'CmdOrCtrl+Alt+Shift+Up' ],
        'move_down_element':    [ 'CmdOrCtrl+Alt+Shift+Down' ],
        'add_before_element':   [ 'CmdOrCtrl+Alt+Up' ],
        'add_after_element':    [ 'CmdOrCtrl+Alt+Down' ],
        'delete_element':       [ 'CmdOrCtrl+Alt+Backspace' ],

        'open_last_recent':     [ 'Ctrl-X Ctrl-R' ],//!!!
    };

    function _freeze_command_bindings(cb) {
        for (const command in cb) {
            Object.freeze(cb[command]);
        }
        Object.freeze(cb);
        return cb;
    }
    function _copy_command_bindings(cb) {
        const ccb = JSON.parse(JSON.stringify(cb));
        return _freeze_command_bindings(ccb);
    }
    function _command_binding_structure_valid(cb) {
        return ( typeof cb === 'object' &&
                 Object.keys(cb).every(k => {
                     return ( typeof k === 'string' &&
                              Array.isArray(cb[k]) &&
                              cb[k].every(ks => (typeof ks === 'string')) );
                }) );
    }

    _freeze_command_bindings(initial_command_bindings);


    // === BINDING TRIE ===

    let _binding_trie;  // initialized below

    // cb: command_string->key_bindings_array
    function _build_binding_trie(cb) {
        const ckb_to_c =  // array of [ canonical_key_binding, command ] entries
              Object.entries(cb)
              .map(([ command, key_bindings ]) => {
                  const canonical_key_bindings = key_bindings.map((key_binding) => {
                      const key_binding_key_specs = key_binding.trim().split(/\s+/);
                      const canonical_key_binding_key_specs = key_binding_key_specs.map(parse_key_spec);
                      const canonical_key_binding = canonical_key_binding_key_specs.join(canonical_key_spec_separator);
                      return canonical_key_binding;
                  });
                  const distinct_canonical_key_bindings = [ ...new Set(canonical_key_bindings).values() ];
                  return distinct_canonical_key_bindings.map(canonical_key_binding => [ canonical_key_binding, command ])
              })
              .reduce((acc, a) => [ ...acc, ...a ])

        const trie = {};
        for (const [ canonical_key_binding, command ] of ckb_to_c) {
            let state = trie;
            for (const canonical_key_spec of canonical_key_binding.split(canonical_key_spec_separator)) {
                let next = state[canonical_key_spec];
                if (!next) {
                    next = state[canonical_key_spec] = {};
                }
                state = next;
            }
            state[null] = command;
        }
        return trie;
    }


    // === KEY BINDING EVENTS ===

    class KeyBindingCommandEvent extends define_subscribable('command-binding') {
        get command (){ return this.data; }
    }

    const _current_event_listeners = new WeakMap();

    function remove_current_key_handler(element) {
        const listener_specs = _current_event_listeners[element];
        if (listener_specs) {
            for (const [ type, listener, options ] of listener_specs) {
                element.removeEventListener(type, listener, options);
            }
            _current_event_listeners.delete(element);
        }
    }

    // element: an HTML element on which to listen for keyboard events
    function bind_key_handler(element) {
        const initial_state = _binding_trie;
        let state;         // current location in _binding_trie
        let key_sequence;  // current sequence of seen canonical key specs

        function reset() {
            state = initial_state;
            key_sequence = [];
        }
        reset();

        const blur_handler = reset;

        const keydown_handler = (event) => {
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
                const canonical_key_spec = parse_keyboard_event(event);
                key_sequence.push(canonical_key_spec);
                const next = state[canonical_key_spec];
                if (!next) {
                    if (state !== initial_state) {
                        // Beep only if at least one keypress has already been accepted.
                        event.preventDefault();
                        beep();
                    }
                    reset();
                } else {
                    event.preventDefault();
                    state = next;
                    const command = state[null];
                    if (command) {
                        KeyBindingCommandEvent.dispatch_event(command);
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
        _current_event_listeners[element] = listener_specs;
    }


    // === GET/SET COMMAND BINDINGS ===

    let command_bindings = _copy_command_bindings(initial_command_bindings);  // command_string->key_bindings_array

    function get_command_bindings() {
        return command_bindings;
    }

    const keyboard_event_listener_target = window;

    function set_command_bindings(cb) {
        // validate structure of cb
        if (!_command_binding_structure_valid(cb)) {
            throw new Error('invalid command_binding structure');
        }

        // copy and freeze new command_bindings structure
        cb = _copy_command_bindings(cb);

        const bt = _build_binding_trie(cb);

        // after success, set the variables and bind the event handlers
        command_bindings = cb;
        _binding_trie    = bt;

        bind_key_handler(keyboard_event_listener_target);
    }

    set_command_bindings(command_bindings);  // sets command_bindings and _binding_trie, and sets new event handlers

    // === EXPORT ===

    facet_export({
        initial_command_bindings,
        get_command_bindings,
        set_command_bindings,
        KeyBindingCommandEvent,
    });

} catch (err) { facet_load_error(err, current_script); } })(facet_init());  // facet end
