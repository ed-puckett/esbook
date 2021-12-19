'use strict';

(async ({ current_script, facet_export, facet_load_error }) => { try {  // facet begin

    function define_subscribable(base_name) {
        const _name_prefix = base_name ? `${base_name}-` : '';

        const _event_target = new EventTarget();
        const _event_type   = `${_name_prefix}${uuidv4()}`;

        const _event_handler_functions = {};

        return class SubscribableEvent extends Event {
            static dispatch_event(data=undefined) {
                _event_target.dispatchEvent(new this(data));
            }

            static subscribe(handler_function) {
                if (typeof handler_function !== 'function') {
                    throw new Error('handler_function must be a function');
                }
                const subscription_key = `${_name_prefix}subscription-${uuidv4()}`;
                _event_handler_functions[subscription_key] = handler_function;
                _event_target.addEventListener(_event_type, handler_function);
                return subscription_key;
            }

            static unsubscribe(subscription_key) {
                const handler_function = _event_handler_functions[subscription_key];
                if (!handler_function) {
                    throw new Error('invalid subscription_key');
                }
                delete _event_handler_functions[subscription_key];
                _event_target.removeEventListener(_event_type, handler_function);
            }

            constructor(data) {
                super(_event_type);
                this.data = data;
            }
        };
    }

    facet_export(define_subscribable);

} catch (err) { facet_load_error(err, current_script); } })(facet_init());  // facet end
