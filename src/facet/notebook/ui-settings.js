'use strict';

(async ({ current_script, facet, facet_export, facet_load_error }) => { try {  // facet begin

    const {
        SettingsUpdatedEvent,
        get_settings,
        update_settings,
    } = await facet('facet/notebook/settings.js');

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

    function get_obj_path(obj, path) {
        for (const segment of path) {
            obj = (obj ?? {})[segment];
        }
        return obj;
    }

    function set_obj_path(obj, path, value) {
        if (path.length < 1) {
            throw new Error('path must contain at least one segment');
        }
        for (const segment of path.slice(0, -1)) {
            if (typeof obj[segment] === 'undefined') {
                obj[segment] = {};
            }
            obj = obj[segment];
        }
        obj[path.slice(-1)[0]] = value;
    }

    function run(output_context) {
        const current_settings = get_settings();

        const ui_section = output_context.create_output_element();
        for (const { section, warnings } of sections) {
            const { name, settings } = section;
            const section_div = globalThis.core.create_child_element(ui_section, 'div', { class: 'section' });

            const named_section_div = globalThis.core.create_child_element(section_div, 'div', { 'data-section': name });
            for (const setting of settings) {
                const { id, label, type, settings_path, options } = setting;
                const setting_div = globalThis.core.create_child_element(named_section_div, 'div', { 'data-setting': undefined });
                let control;
                if (type === 'select') {
                    control = output_context.create_select_element(setting_div, id, {
                        label,
                        options,
                    });
                } else {
                    control = output_context.create_control_element(setting_div, id, {
                        label,
                        type,
                    });
                }

                if (type === 'checkbox') {
                    control.checked = get_obj_path(current_settings, settings_path);
                } else {
                    control.value = get_obj_path(current_settings, settings_path);
                }

                control.addEventListener('change', (event) => {
                    const current_settings = get_settings();
                    if (type === 'checkbox') {
                        set_obj_path(current_settings, settings_path, control.checked);
                    } else {
                        set_obj_path(current_settings, settings_path, control.value);
                    }
                    update_settings(current_settings);
                });
            }

            if (warnings) {
                for (const warning_class in warnings) {
                    const warning_div = globalThis.core.create_child_element(section_div, 'div', { class: `warning ${warning_class}` });
                    for (const warning_text of warnings[warning_class]) {
                        globalThis.core.create_child_element(warning_div, 'p').innerText = warning_text;
                    }
                }
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
