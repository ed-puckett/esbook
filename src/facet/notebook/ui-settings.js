'use strict';

(async ({ current_script, facet, facet_export, facet_load_error }) => { try {  // facet begin

    const {
        SettingsUpdatedEvent,
        get_settings,
        update_settings,
    } = await facet('facet/notebook/settings.js');

    const message_controller = await facet('facet/message-controller.js');

    const sections = [{
        section: {
            name: 'Editor',
            settings: [{
                id: 'editor_options_indentUnit',
                label: 'Indent',
                type: 'text',
                settings_path: [ 'editor_options', 'indentUnit' ],
            }, {
                id: 'editor_options_tabSize',
                label: 'Tab size',
                type: 'text',
                settings_path: [ 'editor_options', 'tabSize' ],
            }, {
                id: 'editor_options_indentWithTabs',
                label: 'Indent with tabs',
                type: 'checkbox',
                settings_path: [ 'editor_options', 'indentWithTabs' ],
            }, {
                id: 'editor_options_keyMap',
                label: 'Keymap',
                type: 'select',
                options: [
                    { value: 'default', label: 'default' },
                    { value: 'emacs',   label: 'emacs'   },
                    { value: 'sublime', label: 'sublime' },
                    { value: 'vim',     label: 'vim'     },
                ],
                settings_path: [ 'editor_options', 'keyMap' ],
            }],
        },
        warnings: {
            'emacs-warning': [
                'Some menu keyboard accelerators are overridden when emacs mode is active.  For example, Ctrl-W, Ctrl-Q, Ctrl-S and others are used for editing commands.  Some of these overridden menu commands are available under emacs key bindings (see Help for details).',
                'Also, when typing in an editor control while in emacs mode, you can press the Alt key to activate the menus and then the normal menu keyboard accelerators will work.'
            ],
        },
    }, {
        section: {
            name: 'Theme Colors',
            settings: [{
                id: 'theme_colors',
                label: 'Theme colors',
                type: 'select',
                options: [
                    { value: 'system', label: 'System' },
                    { value: 'dark',   label: 'Dark'   },
                    { value: 'light',  label: 'Light'  },
                ],
                settings_path: [ 'theme_colors' ],
            }],
        },
    }];

    function run(output_context) {
        const ui_section = output_context.create_output_element();

        for (const { section, warnings } of sections) {
            const { name, settings } = section;
            const section_div = globalThis.core.create_child_element(ui_section, 'div');
            section_div.classList.add = 'section';
            const named_section_div = globalThis.core.create_child_element(section_div, 'div', { 'data-section': name });
            for (const setting of settings) {
                const { id, label, type, settings_path, options } = setting;
                const setting_div = globalThis.core.create_child_element(named_section_div, 'div', { 'data-setting': undefined });
                if (type === 'select') {
                    output_context.create_select_element(setting_div, id, {
                        label,
                        options,
                    });
                } else {
                    output_context.create_control_element(setting_div, id, {
                        label,
                        type,
                    });
                }
                //!!! set initial value
                //!!! set handler
            }
        }

        //!!! disable default key bindings

        // add the stylesheet
        const stylesheet_url = new URL('ui-settings.css', current_script.src);
        globalThis.core.create_stylesheet_link(document.head, stylesheet_url);

        output_context.set_is_dialog_state(true);
        output_context.set_hide_input_state(true);
    }

    facet_export(run);

} catch (err) { facet_load_error(err, current_script); } })(globalThis.core.facet_init());  // facet end
