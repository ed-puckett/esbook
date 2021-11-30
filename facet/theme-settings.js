'use strict';

// This is a facet

(() => {
    try {

        function copy_theme_settings(theme_settings) {
            return JSON.parse(JSON.stringify(theme_settings));
        }

        const dark_mode_media_query_list = window.matchMedia("(prefers-color-scheme: dark)");

        function get_theme_settings() {
            // return a new copy to insulate receivers from each others' modifications
            return {
                shouldUseDarkColors: dark_mode_media_query_list.matches,
            };
        }

        const theme_settings_changed_event_target = document;
        const theme_settings_changed_event_type   = `theme-settings-changed-${uuidv4()}`;

        class ThemeSettingsUpdatedEvent extends Event {
            static dispatch_event() {
                theme_settings_changed_event_target.dispatchEvent(new this());
            }

            constructor() {
                super(theme_settings_changed_event_type);
            }

            get_theme_settings() {
                return get_theme_settings();
            }
        };

        dark_mode_media_query_list.addEventListener('change', function (event) {
            ThemeSettingsUpdatedEvent.dispatch_event();
        });

        const event_handler_functions = {};
        // returns a subscription_key that can be used to unsubscribe
        function subscribe_theme_settings_update(handler_function) {
            if (typeof handler_function !== 'function') {
                throw new Error('handler_function must be a function');
            }
            const subscription_key = `subscribe-theme-settings-${uuidv4()}`;
            event_handler_functions[subscription_key] = handler_function;
            theme_settings_changed_event_target.addEventListener(theme_settings_changed_event_type, handler_function);
            return subscription_key;
        }
        function unsubscribe_theme_settings_update(subscription_key) {
            const handler_function = event_handler_functions[subscription_key];
            if (!handler_function) {
                throw new Error('invalid subscription_key');
            }
            delete event_handler_functions[subscription_key];
            theme_settings_changed_event_target.removeEventListener(theme_settings_changed_event_type, handler_function);
        }

        facet_export({
            get_theme_settings,
            subscribe_theme_settings_update,
            unsubscribe_theme_settings_update,
        });

    } catch (err) {
        facet_load_error(err);
    }
})();
