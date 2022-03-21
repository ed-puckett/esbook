const {
    create_child_element,
    create_stylesheet_link,
} = await import('../dom-util.js');

const {
    Dialog,
    AlertDialog,
    create_control_element,
    create_select_element,
    get_obj_path,
    set_obj_path,
} = await import('../dialog.js');

const {
    SettingsUpdatedEvent,
    get_settings,
    update_settings,
    analyze_editor_options_indentUnit,
    analyze_editor_options_tabSize,
    analyze_editor_options_indentWithTabs,
    valid_editor_options_keyMap_values,
    analyze_editor_options_keyMap,
    valid_formatting_options_align_values,
    analyze_formatting_options_align,
    analyze_formatting_options_indent,
    valid_theme_colors_values,
    analyze_theme_colors,
} = await import('./settings.js');

const {
    beep,
} = await import('../beep.js');

const sections = [{
    section: {
        name: 'Editor',
        settings: [{
            id: 'editor_options_indentUnit',
            label: 'Indent',
            type: 'text',
            settings_path: [ 'editor_options', 'indentUnit' ],
            analyze: (value) => analyze_editor_options_indentUnit(value, 'Indent'),
            convert_to_number: true,
        }, {
            id: 'editor_options_tabSize',
            label: 'Tab size',
            type: 'text',
            settings_path: [ 'editor_options', 'tabSize' ],
            analyze: (value) => analyze_editor_options_tabSize(value, 'Tab size'),
            convert_to_number: true,
        }, {
            id: 'editor_options_indentWithTabs',
            label: 'Indent with tabs',
            type: 'checkbox',
            settings_path: [ 'editor_options', 'indentWithTabs' ],
            analyze: (value) => analyze_editor_options_indentWithTabs(value, 'Indent with tabs'),
        }, {
            id: 'editor_options_keyMap',
            label: 'Key map',
            type: 'select',
            options: valid_editor_options_keyMap_values.map(value => ({ value, label: value })),
            settings_path: [ 'editor_options', 'keyMap' ],
            analyze: (value) => analyze_editor_options_keyMap(value, 'Key map'),
        }],
    },
}, {
    section: {
        name: 'TeX Formatting',
        settings: [{
            id: 'formatting_options_align',
            label: 'Horizontal alignment',
            type: 'select',
            options: valid_formatting_options_align_values.map(value => ({ value, label: value })),
            settings_path: [ 'formatting_options', 'align' ],
            analyze: (value) => analyze_formatting_options_align(value, 'Align'),
        }, {
            id: 'formatting_options_indent',
            label: 'Indentation',
            type: 'text',
            settings_path: [ 'formatting_options', 'indent' ],
            analyze: (value) => analyze_formatting_options_indent(value, 'Indentation'),
        }],
    },
}, {
    section: {
        name: 'Appearance',
        settings: [{
            id: 'theme_colors',
            label: 'Theme',
            type: 'select',
            options: valid_theme_colors_values.map(value =>({ value, label: value })),
            settings_path: [ 'theme_colors' ],
            analyze: (value) => analyze_theme_colors(value, 'Theme colors'),
        }],
    },
}];

export class SettingsDialog extends Dialog {
    static settings_dialog_css_class = 'settings-dialog';

    /** focus a pre-existing instance of the settings dialog or run
     *  a new instance of the dialog if one does not currently exist.
     *  @return {Promise}
     */
    static run(message, options) {
        const pre_existing_element = document.querySelector(`#content #ui .${this.settings_dialog_css_class}`);
        if (pre_existing_element) {
            // set focus if necessary
            if (document.activeElement.closest(`.${this.settings_dialog_css_class}`) !== pre_existing_element) {
                setTimeout(() => pre_existing_element.querySelector('.dialog_accept').focus());
            }
            const pre_existing_instance = Dialog.instance_from_element(pre_existing_element);
            if (!pre_existing_instance) {
                throw new Error(`unexpected: Dialog.instance_from_element() returned null for element with class ${this.settings_dialog_css_class}`);
            }
            return pre_existing_instance.promise;
        } else {
            return new this().run();
        }
    }

    _populate_dialog_element() {
        const current_settings = get_settings();

        // make this dialog identifiable so that the static method run()
        // can find it if it already exists.
        this._dialog_element.classList.add(this.constructor.settings_dialog_css_class);

        for (const { section } of sections) {
            const { name, settings } = section;
            const section_div = create_child_element(this._dialog_element, 'div', { class: 'section' });

            const named_section_div = create_child_element(section_div, 'div', { 'data-section': name });
            const error_div = create_child_element(section_div, 'div', { class: `error-message` });

            for (const setting of settings) {
                const { id, label, type, settings_path, options, analyze, convert_to_number } = setting;
                const setting_div = create_child_element(named_section_div, 'div', { 'data-setting': undefined });
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

                const update_handler = async (event) => {
                    const current_settings = get_settings();

                    const handle_error = async (error_message) => {
                        error_div.classList.add('active');
                        error_div.innerText = error_message;
                        const existing_control = document.getElementById(control.id);
                        if (!this._completed && existing_control) {
                            existing_control.focus();
                            if (existing_control instanceof HTMLInputElement && existing_control.type === 'text') {
                                existing_control.select();
                            }
                            await beep();
                        } else {
                            await AlertDialog.run(`settings update failed: ${error_message}`);
                        }
                    };

                    const value = (type === 'checkbox') ? control.checked : control.value;
                    if (analyze) {
                        const complaint = analyze(value)
                        if (complaint) {
                            await handle_error(complaint);
                            return;
                        }
                    }
                    set_obj_path(current_settings, settings_path, (convert_to_number ? +value : value));

                    try {
                        await update_settings(current_settings)
                        error_div.classList.remove('active');
                    } catch (error) {
                        await handle_error(error.message);
                    }
                };

                control.addEventListener('change', update_handler);
                control.addEventListener('blur',   update_handler);
            }
        }

        const button_container = create_child_element(this._dialog_element, 'span');
        const accept_button = create_child_element(button_container, 'button', {
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

        //!!! need to disable default key bindings?

        // add the stylesheet
        const stylesheet_url = new URL('settings-dialog.css', import.meta.url);
        create_stylesheet_link(document.head, stylesheet_url);
    }
}
