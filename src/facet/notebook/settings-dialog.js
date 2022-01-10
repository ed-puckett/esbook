'use strict';

(async ({ current_script, facet, facet_export, facet_load_error }) => { try {  // facet begin

    const {
        Dialog,
        create_control_element,
        create_select_element,
        get_obj_path,
        set_obj_path,
    } = await facet('facet/dialog.js');

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

    class SettingsDialog extends Dialog {
        _populate_dialog_element() {
            const current_settings = get_settings();

            for (const { section, warnings } of sections) {
                const { name, settings } = section;
                const section_div = globalThis.core.create_child_element(this._dialog_element, 'div', { class: 'section' });

                const named_section_div = globalThis.core.create_child_element(section_div, 'div', { 'data-section': name });
                for (const setting of settings) {
                    const { id, label, type, settings_path, options } = setting;
                    const setting_div = globalThis.core.create_child_element(named_section_div, 'div', { 'data-setting': undefined });
                    let control;
                    if (type === 'select') {
                        control = create_select_element(setting_div, id, {
                            label,
                            options,
                        });
                    } else {
                        control = create_control_element(setting_div, id, {
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

            const button_container = globalThis.core.create_child_element(this._dialog_element, 'span');
            const accept_button = globalThis.core.create_child_element(button_container, 'button', {
                class: 'dialog_accept',
            });
            accept_button.innerText = 'Done';
            accept_button.onclick = (event) => this._complete();
            button_container.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.stopPropagation();
                    event.preventDefault();
                    this._complete();
                }
            }, {
                capture: true,
            });

            this._dialog_element.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    event.stopPropagation();
                    event.preventDefault();
                    this._complete();
                }
            }, {
                capture: true,
            });

            setTimeout(() => accept_button.focus());

            //!!! disable default key bindings

            // add the stylesheet
            const stylesheet_url = new URL('settings-dialog.css', current_script.src);
            globalThis.core.create_stylesheet_link(document.head, stylesheet_url);
        }
    }


    // === EXPORT ===

    facet_export({
        SettingsDialog,
    });

} catch (err) { facet_load_error(err, current_script); } })(globalThis.core.facet_init());  // facet end
