'use strict';

(async ({ current_script, facet, facet_export, facet_load_error }) => { try {  // facet begin

    const {
        SettingsUpdatedEvent,
        get_settings,
        update_settings,
    } = await facet('facet/notebook/settings.js');

    const message_controller = await facet('facet/message-controller.js');

    function run(output_context) {
        const ui_section = output_context.create_output_element();

        const value = output_context.create_control_element(ui_section, 'ui-value', {
            label: 'Value',
        });
        value.addEventListener('change', (event) => {
            event.preventDefault();
            message_controller.alert(`>>> change: ${event.target.value}`);
        });

        output_context.create_control_element(ui_section, 'ui-hide-input', {
            label: 'Hide input',
            type:  'checkbox',
            attrs: {
                checked: 'on',
            },
        }).addEventListener('change', (event) => {
            event.preventDefault();
            output_context.set_hide_input_state(event.target.checked);
        });

        output_context.set_is_dialog_state(true);
        output_context.set_hide_input_state(true);

        setTimeout(() => value.focus());
    }

    facet_export(run);

} catch (err) { facet_load_error(err, current_script); } })(globalThis.core.facet_init());  // facet end
