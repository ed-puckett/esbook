'use strict';

(async ({ current_script, facet_export, facet_load_error }) => { try {  // facet begin

    const define_subscribable = await facet('facet/subscribable.js');

    const commands = [
        'undo',
        'redo',
        'clear_notebook',
        'open_notebook',
        'import_notebook',
        'reopen_notebook',
        'save_notebook',
        'save_as_notebook',
        'eval_element',
        'eval_stay_element',
        'eval_notebook',
        'eval_notebook_before',
        'focus_up_element',
        'focus_down_element',
        'move_up_element',
        'move_down_element',
        'add_before_element',
        'add_after_element',
        'delete_element',
    ];

    const key_bindings_specs = {
        'CmdOrCtrl+Z':              'undo',
        'CmdOrCtrl+Shift+Z':        'redo',
        'CmdOrCtrl+Shift+C':        'clear_notebook',
        'CmdOrCtrl+O':              'open_notebook',
        'CmdOrCtrl+Shift+O':        'import_notebook',
        'CmdOrCtrl+R':              'reopen_notebook',
        'CmdOrCtrl+S':              'save_notebook',
        'CmdOrCtrl+Shift+S':        'save_as_notebook',
        'CmdOrCtrl+Enter':          'eval_element',
        'CmdOrCtrl+Shift+Enter':    'eval_stay_element',
        'CmdOrCtrl+Shift+!':        'eval_notebook',
        'CmdOrCtrl+Shift+Alt+!':    'eval_notebook_before',
        'Alt+Up':                   'focus_up_element',
        'Alt+Down':                 'focus_down_element',
        'CmdOrCtrl+Alt+Shift+Up':   'move_up_element',
        'CmdOrCtrl+Alt+Shift+Down': 'move_down_element',
        'CmdOrCtrl+Alt+Up':         'add_before_element',
        'CmdOrCtrl+Alt+Down':       'add_after_element',
        'CmdOrCtrl+Alt+Backspace':  'delete_element',
    };

    const is_on_macos = (navigator.platform ?? navigator.userAgentData.platform ?? '').toLowerCase().startsWith('mac');

    const CmdOrCtrl_event_field = is_on_macos ? 'metaKey' : 'ctrlKey';

    function key_spec_modifier_to_event_field(modifier) {
        switch (modifier.toLowerCase()) {
        case 'cmdorctrl':     return CmdOrCtrl_event_field;
        case 'commandorctrl': return CmdOrCtrl_event_field;
        case 'ctrl':          return 'ctrlKey';
        case 'shift':         return 'shiftKey';
        case 'cmd':           return 'metaKey';
        case 'command':       return 'metaKey';
        case 'meta':          return 'metaKey';
        case 'alt':           return 'altKey';
        default: return undefined;
        }
    }

    function parse_key_spec(key_spec) {
        if (typeof key_spec !== 'string') {
            throw new Error('key_spec must be a string');
        }
        const modifiers = key_spec.split(/\s*[+-]\s*/).map(s => s.toLowerCase());
        if (modifiers.length < 1 || modifiers.some(s => s.length <= 0)) {
            throw new Error('invalid key_spec');
        }
        let key = modifiers[modifiers.length-1];
        if (['up', 'down', 'left', 'right'].includes(key)) {
            key = `arrow${key}`;
        }
        modifiers.splice(modifiers.length-1, 1);
        const modifier_event_fields = {};
        for (const modifier of modifiers) {
            const event_field = key_spec_modifier_to_event_field(modifier);
            if (!event_field) {
                throw new Error(`invalid modifier "${modifier}" in key_spec ${key_spec}`);
            }
            if (event_field in modifier_event_fields) {
                throw new Error(`redundant modifier "${modifier}" in key_spec ${key_spec}`);
            }
            modifier_event_fields[event_field] = true;
        }
        return { key, modifier_event_fields };
    }

    const key_bindings = Object.entries(key_bindings_specs).map(([ key_spec, command ]) => [ parse_key_spec(key_spec), command ]);

    function compare_key_event(event, key, modifier_event_fields) {
        if (event.key.toLowerCase() !== key) {
            return false;
        }
        for (const event_field of [
            'ctrlKey',
            'shiftKey',
            'metaKey',
            'altKey',
        ]) {
            if (!!event[event_field] !== !!modifier_event_fields[event_field]) {
                return false;
            }
        }
        return true;
    }

    function key_event_to_command(event) {
        for (const [ { key, modifier_event_fields }, command ] of key_bindings) {
            if (compare_key_event(event, key, modifier_event_fields))
                return command;
        }
        return undefined;
    }

    facet_export({
        commands,
        key_bindings_specs,
        is_on_macos,
        CmdOrCtrl_event_field,
        parse_key_spec,
        key_bindings,
        compare_key_event,
        key_event_to_command,
    });

} catch (err) { facet_load_error(err, current_script); } })(facet_init());  // facet end
