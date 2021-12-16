'use strict';

(async ({ current_script, facet_export, facet_load_error }) => { try {  // facet begin

    const define_subscribable = await facet('facet/subscribable.js');


    // === THEME SETTINGS INTERFACE ===

    const dark_mode_media_query_list = globalThis.matchMedia("(prefers-color-scheme: dark)");

    function get_theme_settings() {
        // return a new copy to insulate receivers from each others' modifications
        return {
            shouldUseDarkColors: dark_mode_media_query_list.matches,
        };
    }

    dark_mode_media_query_list.addEventListener('change', function (event) {
        ThemeSettingsUpdatedEvent.dispatch_event();
    });


    // === EVENT INTERFACE ===

    class ThemeSettingsUpdatedEvent extends define_subscribable('theme-settings') {
        get_theme_settings() {
            // return a copy to insulate receivers from each others' modifications
            return get_theme_settings();
        }
    }


    // === DOCUMENT DARK THEME SETTING ===

    // add theme-settings/theme-colors.css stylesheet
    const theme_colors_stylesheet_url = new URL('theme-settings/theme-colors.css', current_script.src);
    create_stylesheet(document.head, theme_colors_stylesheet_url);

    const dark_mode_class = 'dark';

    const root_element = document.getElementsByTagName('html')[0];

    function update_document_dark_state(dark_state) {
        if (dark_state) {
            root_element.classList.add(dark_mode_class);
        } else {
            root_element.classList.remove(dark_mode_class);
        }
    }


    // === EXPORT ===

    facet_export({
        ThemeSettingsUpdatedEvent,
        get_theme_settings,
        update_document_dark_state,
    });

} catch (err) { facet_load_error(err, current_script); } })(facet_init());  // facet end
