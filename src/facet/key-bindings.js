'use strict';

(async ({ current_script, facet_export, facet_load_error }) => { try {  // facet begin

    const {
        parse_key_spec,
        parse_keyboard_event,
    } = await facet('facet/key-spec.js');

    const define_subscribable = await facet('facet/subscribable.js');


    // === COMMANDS AND KEY BINDINGS ===

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

    let command_specs = JSON.parse(JSON.stringify(initial_command_specs));  // command_string->key_specs_array

    function _freeze_command_specs(ksfc) {
        Object.freeze(ksfc);
        for (const command in ksfc) {
            Object.freeze(ksfc[command]);
        }
        return ksfc;
    }
    _freeze_command_specs(initial_command_specs);
    _freeze_command_specs(command_specs);

    function get_command_specs() {
        return _freeze_command_specs(command_specs);
    }

    const key_bindings =  // array of [ canonical_key_spec, command ] elements
          Object.freeze(
              Object.entries(command_specs)
                  .map(([ command, key_specs ]) => {
                      const canonical_key_specs = key_specs.map(parse_key_spec);
                      const distinct_canonical_key_specs = [ ...new Set(canonical_key_specs).values() ];
                      return distinct_canonical_key_specs.map(canonical_key_spec => [ canonical_key_spec, command ])
                  })
                  .reduce((acc, a) => [ ...acc, ...a ])
          );

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

    facet_export({
        initial_command_specs,
        get_command_specs,
        key_bindings,
        keyboard_event_to_command,
        KeyBindingEvent,
    });

} catch (err) { facet_load_error(err, current_script); } })(facet_init());  // facet end
