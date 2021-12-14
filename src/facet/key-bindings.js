'use strict';

(async ({ current_script, facet_export, facet_load_error }) => { try {  // facet begin

    const define_subscribable = await facet('facet/subscribable.js');

    const {
        parse_key_spec,
        parse_keyboard_event,
    } = await facet('facet/key-spec.js');


    // === COMMAND SPECS ===

    const initial_command_specs = {  // command_string->key_specs_array
        'undo':                 [ 'CmdOrCtrl+Z' ],
        'redo':                 [ 'CmdOrCtrl+Shift+Z' ],
        'clear_notebook':       [ 'CmdOrCtrl+Shift+C' ],
        'open_notebook':        [ 'CmdOrCtrl+O' ],
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
    };

    function _freeze_command_specs(cs) {
        for (const command in cs) {
            Object.freeze(cs[command]);
        }
        Object.freeze(cs);
        return cs;
    }
    function _copy_command_specs(cs) {
        const ccs = JSON.parse(JSON.stringify(cs));
        return _freeze_command_specs(ccs);
    }
    function _command_spec_structure_valid(cs) {
        return ( typeof cs === 'object' &&
                 Object.keys(cs).every(k => {
                     return ( typeof k === 'string' &&
                              Array.isArray(cs[k]) &&
                              cs[k].every(ks => (typeof ks === 'string')) );
                }) );
    }

    _freeze_command_specs(initial_command_specs);


    // === KEY BINDINGS ===

    function _freeze_key_bindings(kb) {
        for (const kbe of kb) {
            Object.freeze(kbe);
        }
        Object.freeze(kb);
        return kb;
    }


    // === DERIVATION OF KEY BINDINGS FROM COMMAND SPECS ===

    let command_specs = _copy_command_specs(initial_command_specs);  // command_string->key_specs_array

    function get_command_specs() {
        return command_specs;
    }

    let key_bindings;  // (initialized below) array of [ canonical_key_spec, command ] elements

    function get_key_bindings() {
        return key_bindings;
    }

    function set_command_specs(cs) {
        // validate structure of cs
        if (!_command_spec_structure_valid(cs)) {
            throw new Error('invalid command_spec structure');
        }

        // copy and freeze new command_specs structure
        cs = _copy_command_specs(cs);

        const kb = Object.entries(cs)
              .map(([ command, key_specs ]) => {
                  const canonical_key_specs = key_specs.map(parse_key_spec);
                  const distinct_canonical_key_specs = [ ...new Set(canonical_key_specs).values() ];
                  return distinct_canonical_key_specs.map(canonical_key_spec => [ canonical_key_spec, command ])
              })
              .reduce((acc, a) => [ ...acc, ...a ])

        // freeze new key_bindings
        _freeze_key_bindings(kb);

        // after success, set the variables
        command_specs = cs;
        key_bindings  = kb;
    }

    set_command_specs(initial_command_specs);


    // === KEYBOARD EVENT TO COMMAND INTERFACE ===

    function keyboard_event_to_command(keyboard_event) {
        const event_canonical_key_spec = parse_keyboard_event(keyboard_event);
        for (const [ canonical_key_spec, command ] of key_bindings) {
            if (canonical_key_spec === event_canonical_key_spec) {
                return command;
            }
        }
        return undefined;
    }

    class KeyBindingEvent extends define_subscribable('key-binding') {
        get command (){ return this.data; }
    }
    window.addEventListener('keydown', (event) => {
        const command = keyboard_event_to_command(event);
        if (command) {
            event.preventDefault();
            KeyBindingEvent.dispatch_event(command);
        }
    });


    // === EXPORT ===

    facet_export({
        initial_command_specs,
        get_command_specs,
        set_command_specs,
        get_key_bindings,
        keyboard_event_to_command,
        KeyBindingEvent,
    });

} catch (err) { facet_load_error(err, current_script); } })(facet_init());  // facet end
