const { define_subscribable } = await import('../subscribable.js');


// === THEME SETTINGS INTERFACE ===

const dark_mode_media_query_list = globalThis.matchMedia("(prefers-color-scheme: dark)");

export function get_theme_settings() {
    // return a new copy to insulate receivers from each others' modifications
    return {
        shouldUseDarkColors: dark_mode_media_query_list.matches,
    };
}

dark_mode_media_query_list.addEventListener('change', function (event) {
    ThemeSettingsUpdatedEvent.dispatch_event();
});


// === EVENT INTERFACE ===

export class ThemeSettingsUpdatedEvent extends define_subscribable('theme-settings') {
    get_theme_settings() {
        // return a copy to insulate receivers from each others' modifications
        return get_theme_settings();
    }
}


// === DOCUMENT DARK THEME SETTING ===

// add theme-settings/theme-colors.css stylesheet
const theme_colors_stylesheet_url = new URL('theme-settings/theme-colors.css', import.meta.url);
globalThis.core.create_stylesheet_link(document.head, theme_colors_stylesheet_url);

const dark_mode_class = 'dark';

const root_element = document.getElementsByTagName('html')[0];

export function update_document_dark_state(dark_state) {
    if (dark_state) {
        root_element.classList.add(dark_mode_class);
    } else {
        root_element.classList.remove(dark_mode_class);
    }
}
