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

        core.create_child_element(
            ui_section, 'label',
            'for', 'ui-value',
        ).innerText = 'Value';
        const value = core.create_child_element(
            ui_section, 'input',
            'id', 'ui-value',
            'type', 'text',
        );
        value.addEventListener('change', (event) => {
            message_controller.alert(`>>> change: ${event.target.value}`);
        });
        output_context.hide_input(true);
        setTimeout(() => value.focus());
    }

    facet_export(run);

} catch (err) { facet_load_error(err, current_script); } })(globalThis.core.facet_init());  // facet end
