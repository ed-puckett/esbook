'use strict';

(async ({ current_script, facet_export, facet_load_error }) => { try {  // facet begin

    // === CONSTANTS ===

    const NB_TYPE    = 'esbook';
    const NB_VERSION = '1.0.0';

    const DEFAULT_SAVE_PATH = 'new-notebook.esbook';
    const DEFAULT_LOAD_PATH = '';

    const CM_DARK_MODE_THEME  = 'blackboard';
    const CM_LIGHT_MODE_THEME = 'default';


    // === EXTERNAL MODULES ===

    const message_controller = await facet('facet/message-controller.js')
    const fs_interface       = await facet('facet/fs-interface.js');

    const { beep } = await facet('facet/beep.js');

    const {
        marked,
        is_MathJax_v2,
        MathJax,
    } = await facet('facet/md+mj.js');

    const { SettingsUpdatedEvent      } = await facet('facet/notebook/settings.js')
    const { ThemeSettingsUpdatedEvent } = await facet('facet/notebook/theme-settings.js')

    const {
        KeyBindingCommandEvent,
    } = await facet('facet/notebook/key-bindings.js');

    const {
        TEXT_ELEMENT_CLASS,
        clean_for_html,
        output_handlers,
    } = await facet('facet/notebook/output-handlers.js');

    const {
        Change,
        add_edit_change,
        perform_move_up_ie_change,
        perform_move_down_ie_change,
        perform_add_new_before_ie_change,
        perform_add_new_after_ie_change,
        perform_delete_ie_change,
        perform_state_change,
        add_ie_output_change,
    } = await facet('facet/notebook/change.js');

    const {
        TextuallyLocatedError,
        EvalWorker,
    } = await facet('facet/notebook/eval-worker.js');

//!!!    const file_selector = require('./file-selector.js');


    // === NOTEBOOK INSTANCE ===

    let notebook;  // initialized in document_ready() below


    // === SETTINGS ===

    let settings;        // initialized and updated by settings_state event
    let theme_settings;  // initialized and updated by settings_state event

    SettingsUpdatedEvent.subscribe((event) => {
        settings = event.get_settings();
        notebook?.update_from_settings();
    });

    ThemeSettingsUpdatedEvent.subscribe((event) => {
        theme_settings = event.get_theme_settings();
        notebook?.update_from_settings();
    });


    // === NOTEBOOK LOAD BOOTSTRAP ===

    // We are using MathJax v2.7.x instead of v3.x.x because Plotly
    // (used in ./output-handlers.js) still requires the older version.
    // We want to upgrade when Plotly supports it.

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', document_ready, { once: true });
    } else {
        // use setTimeout() so that document_ready()
        // runs after the rest of this script has loaded
        setTimeout(document_ready);
    }
    async function document_ready() {
        if (!is_MathJax_v2) {
            // only available in MathJax v3
            await MathJax.startup.promise;
        }
        notebook = new Notebook();
        await notebook.setup();
        notebook.update_from_settings();  // in case setting update already received
    }


    // === NOTEBOOK CLASS ===

    class Notebook {
        static nb_type    = NB_TYPE;
        static nb_version = NB_VERSION;

        static default_save_path = DEFAULT_SAVE_PATH;
        static default_load_path = DEFAULT_LOAD_PATH;

        static cm_dark_mode_theme  = CM_DARK_MODE_THEME;
        static cm_light_mode_theme = CM_LIGHT_MODE_THEME;

        static emacs_special_key_bindings = {
            'Ctrl-X Ctrl-F': () => notebook.open_notebook(),
            'Ctrl-X Ctrl-S': () => notebook.save_notebook(false),
            'Ctrl-X Ctrl-W': () => notebook.save_notebook(true),
        };

        static _input_text_type_header_re = /^%.*$/m;  // if present, then the input following is markdown+MathJax

        // async setup/initialization (to be called immediately after construction)
        async setup() {
            // notebook focus
            this.current_ie = undefined;  // initialized below

            // notebook persistent state
            this.notebook_path         = undefined;
            this.notebook_fs_timestamp = undefined;  // timestamp from when last loaded/saved, or undefined
            this.nb_state              = undefined;  // persisted state; first initialized below when this.clear_notebook() is called
            this.internal_nb_state     = undefined;  // not persisted;   first initialized below when this.clear_notebook() is called

            this._loaded_notebook_hash = undefined;  // used by this.set_notebook_unmodified() and this.notebook_modified()

            this.interaction_area      = undefined;  // will be set in this._setup_document()

            try {

                await this._initialize_document();

                // replace CodeMirror undo/redo with our implementation
                CodeMirror.commands.undo = (cm) => Change.perform_undo(this);
                CodeMirror.commands.redo = (cm) => Change.perform_redo(this);

                this.init_event_handlers();

                // initialize empty notebook
                this.clear_notebook(true);

            } catch (err) {

                console.error('initialization failed', err.stack);
                document.body.innerHTML = '';  // completely reset body
                document.body.classList.add('error');
                const err_h1 = document.createElement('h1');
                err_h1.textContent = 'Initialization Failed';
                const err_pre = document.createElement('pre');
                err_pre.textContent = clean_for_html(err.stack);
                document.body.appendChild(err_h1);
                document.body.appendChild(err_pre);
                throw err;
            }
        }

        async _initialize_document() {
            if (document.getElementById('content')) {
                throw new Error('initial document must not contain an element with id "content"');
            }

            // add initial notebook structure to document body:
            //
            //     <div id="content">
            //         <div id="interaction_area">
            //             ....
            //         </div>
            //     </div>

            const content_el = create_child_element(document.body, 'div', 'id', 'content');
            this.interaction_area = create_child_element(content_el, 'div', 'id', 'interaction_area');

            // add notebook stylesheet:
            const stylesheet_url = new URL('notebook/notebook.css', current_script.src);
            create_stylesheet(document.head, stylesheet_url);

            // load CodeMirror scripts:
            for (const script_path of [
                '../../node_modules/codemirror/lib/codemirror.js',
                '../../node_modules/codemirror/mode/markdown/markdown.js',
                '../../node_modules/codemirror/mode/stex/stex.js',
                '../../node_modules/codemirror/mode/javascript/javascript.js',
                '../../node_modules/codemirror/keymap/sublime.js',
                '../../node_modules/codemirror/keymap/vim.js',
                '../../node_modules/codemirror/addon/dialog/dialog.js',
                '../../node_modules/codemirror/addon/search/search.js',
                '../../node_modules/codemirror/addon/search/searchcursor.js',
                '../../node_modules/codemirror/addon/search/jump-to-line.js',
                '../../node_modules/codemirror/addon/edit/matchbrackets.js',
                'notebook/codemirror-md+mj-mode.js',
            ]) {
                const script_url = new URL(script_path, current_script.src);
                await load_script(document.head, script_url);
            }

            // load CodeMirror stylesheets:
            for (const stylesheet_path of [
                '../../node_modules/codemirror/lib/codemirror.css',
                '../../node_modules/codemirror/theme/blackboard.css',
                '../../node_modules/codemirror/addon/dialog/dialog.css',
            ]) {
                const stylesheet_url = new URL(stylesheet_path, current_script.src);
                create_stylesheet(document.head, stylesheet_url);
            }
        }

        _object_hasher(obj) {
            return sha256(JSON.stringify(obj));
        }

        update_from_settings() {
            for (const ie_id of this.nb_state.order) {
                const cm = this.get_internal_state_for_ie_id(ie_id)?.cm;
                if (cm) {
                    const ie = document.getElementById(ie_id);
                    this.update_cm_from_settings(cm, ie);
                }
            }
            //!!! other updates?
        }

        // called exactly once (by constructor)
        init_event_handlers() {
            KeyBindingCommandEvent.subscribe((event) => this.handle_ie_command(event.command));
        }

        init_ie_event_handlers(ie) {
            ie.addEventListener('click', this._ie_click_handler.bind(this), true);
        }

        _ie_click_handler(event) {
            if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
                const ie = event.target.closest('.interaction_element');
                this.set_current_ie(ie, true);
            }
            event.preventDefault();
            event.stopPropagation();
        }

        // Set a new notebook_path and update things accordingly.
        set_notebook_path(path, fs_timestamp=undefined) {
            this.notebook_path = path;
            this.notebook_fs_timestamp = fs_timestamp;

            let title = 'Untitled';
            if (this.notebook_path) {
                const notebook_path_components = new URL(this.notebook_path).pathname.split('/');
                const basename = notebook_path_components[notebook_path_components.length-1];
                if (basename) {
                    title = basename;
                }
            }
            document.title = title;
        }

        // Set a new empty state for the notebook.
        set_new_notebook_state() {
            this.nb_state = {
                nb_type:    this.constructor.nb_type,
                nb_version: this.constructor.nb_version,
                order:    [],  // interaction_element ids, in order of appearance in notebook
                elements: {},  // the actual interaction_element data, indexed by interaction_element id
            };
            this.internal_nb_state = {};  // indexed by ie.id
        }

        // Create a new empty internal state object for ie with id ie_id
        // or return the current internal state object if it already exists.
        establish_internal_state_for_ie_id(ie_id) {
            const current_state = this.internal_nb_state[ie_id];
            if (current_state) {
                return current_state;
            } else {
                return (this.internal_nb_state[ie_id] = {});
            }
        }

        // Remove the internal state object for ie with id ie_id.
        remove_internal_state_for_ie_id(ie_id) {
            this.remove_eval_worker_for_ie_id(ie_id);
            delete this.internal_nb_state[ie_id];
        }

        remove_eval_worker_for_ie_id(ie_id) {
            const internal_state = this.get_internal_state_for_ie_id(ie_id);
            if (internal_state) {
                internal_state.eval_worker?.stop();  // stop old eval_worker, if any
                internal_state.eval_worker = undefined;
            }
        }
        set_eval_worker_for_ie_id(ie_id, eval_worker) {
            this.remove_eval_worker_for_ie_id(ie_id);
            const internal_state = this.establish_internal_state_for_ie_id(ie_id);
            internal_state.eval_worker = eval_worker;
        }

        // Remove ie with id ie_id from this.nb_state and this.internal_nb_state
        remove_state_for_ie_id(ie_id) {
            const order_index = this.nb_state.order.indexOf(ie_id);
            if (order_index !== -1) {
                this.nb_state.order.splice(order_index, 1);
            }
            delete this.nb_state.elements[ie_id];
            this.remove_internal_state_for_ie_id(ie_id);
        }

        // Return the internal state object associated with the ie with id ie_id.
        get_internal_state_for_ie_id(ie_id) {
            return this.internal_nb_state[ie_id];
        }

        get_input_text_for_ie_id(ie_id) {
            return this.get_internal_state_for_ie_id(ie_id).cm.getValue();
        }

        set_input_text_for_ie_id(ie_id, text) {
            const cm = this.get_internal_state_for_ie_id(ie_id).cm;
            cm.setValue(text);
            cm.setCursor(0, 0);
        }

        // *_pos may be either line or [ line, col ]
        // line is 1-based, col is 0-based.
        // If end_pos is not specified, use end_pos=start_pos
        set_input_selection_for_ie_id(ie_id, start_pos, end_pos) {
            if (typeof start_pos === 'number') {
                start_pos = [ start_pos, 0 ];
            }
            if (typeof end_pos === 'number') {
                end_pos = [ end_pos, 0 ];
            }
            const cm = this.get_internal_state_for_ie_id(ie_id).cm;
            // CodeMirror line numbers are 0-based
            if (end_pos) {
                cm.setSelection( { line: start_pos[0]-1, ch: start_pos[1] },
                                 { line: end_pos[0]-1,   ch: end_pos[1]   } );
            } else {
                cm.setCursor({ line: start_pos[0]-1, ch: start_pos[1] });
            }
        }

        set_input_focus_for_ie_id(ie_id) {
            this.get_internal_state_for_ie_id(ie_id).cm.focus();
        }

        handle_ie_command(command) {
            switch (command) {
            case 'undo': {
                Change.perform_undo(this);
                break;
            }
            case 'redo': {
                Change.perform_redo(this);
                break;
            }
            case 'clear_notebook': {
                this.clear_notebook();
                break;
            }
            case 'open_notebook': {
                const do_import = false;
                this.open_notebook(do_import);
                break;
            }
            case 'import_notebook': {
                const do_import = true;
                this.open_notebook(do_import);
                break;
            }
            case 'reopen_notebook': {
                if (!this.notebook_path) {
                    this.clear_notebook();
                } else {
                    this.open_notebook_from_path(this.notebook_path);
                }
                break;
            }
            case 'save_notebook': {
                const interactive = false;
                this.save_notebook(interactive);
                break;
            }
            case 'save_as_notebook': {
                const interactive = true;
                this.save_notebook(interactive);
                break;
            }
            case 'eval_element': {
                this.ie_ops_eval_element(this.current_ie, false);
                break;
            }
            case 'eval_stay_element': {
                this.ie_ops_eval_element(this.current_ie, true);
                break;
            }
            case 'eval_notebook': {
                this.ie_ops_eval_notebook(this.current_ie, false);
                break;
            }
            case 'eval_notebook_before': {
                this.ie_ops_eval_notebook(this.current_ie, true);
                break;
            }
            case 'focus_up_element': {
                const ie_to_focus = this.current_ie.previousElementSibling || this.current_ie;
                this.set_current_ie(ie_to_focus);
                break;
            }
            case 'focus_down_element': {
                const ie_to_focus = this.current_ie.nextElementSibling || this.current_ie;
                this.set_current_ie(ie_to_focus);
                break;
            }
            case 'move_up_element': {
                perform_move_up_ie_change(this, this.current_ie.id);
                break;
            }
            case 'move_down_element': {
                perform_move_down_ie_change(this, this.current_ie.id);
                break;
            }
            case 'add_before_element': {
                perform_add_new_before_ie_change(this, this.current_ie.id);
                break;
            }
            case 'add_after_element': {
                perform_add_new_after_ie_change(this, this.current_ie.id);
                break;
            }
            case 'delete_element': {
                perform_delete_ie_change(this, this.current_ie);
                break;
            }
            default: {
                console.warn('** command not handled:', command);
                break;
            }
            }
        }

        async ie_ops_eval_element(ie, stay=false) {
            if (this.get_input_text_for_ie_id(ie.id).trim()) {  // if there is anything to evaluate...
                await this.evaluate_ie(ie, stay);
                this.send_tab_state_to_parent_processes();
            }
        }

        async ie_ops_eval_notebook(ie, only_before_current_element=false) {
            for (const ie_id of this.nb_state.order) {
                if (only_before_current_element && ie_id === ie.id) {
                    this.set_current_ie(ie);
                    break;
                }
                const ie_to_eval = document.getElementById(ie_id);
                this.set_current_ie(ie_to_eval);
                if (this.get_input_text_for_ie_id(ie_to_eval.id).trim()) {  // if there is anything to evaluate...
                    if (! await this.evaluate_ie(ie_to_eval, true)) {
                        break;
                    }
                }
            }
            this.send_tab_state_to_parent_processes();
        }

        update_global_view_properties() {
            // currently nothing...
        }

        send_tab_state_to_parent_processes() {
            //!!! nothing...
        }

        set_notebook_unmodified() {
            this._loaded_notebook_hash = this._current_notebook_hash();
        }
        notebook_modified() {
            // once modified, the notebook stays that way until this.set_notebook_unmodified() is called
            const current_hash = this._current_notebook_hash();
            return (current_hash !== this._loaded_notebook_hash);
        }
        _current_notebook_hash() {
            const items = [
                this.nb_state,
                [ ...this.interaction_area.querySelectorAll('.interaction_element') ]
                    .map(ie => this.get_input_text_for_ie_id(ie.id)),
            ];
            return this._object_hasher(items);
        }

        // create a new empty notebook with a single interaction_element element
        clear_notebook(force=false) {
            if (!force && this.notebook_modified()) {
                if (! message_controller.confirm_sync('Warning: changes not saved, clear document anyway?')) {
                    return;
                }
            }

            // remove all current interaction_element elements
            for (const ie of this.interaction_area.querySelectorAll('.interaction_element')) {
                this.interaction_area.removeChild(ie);
            }

            // reset state
            this.set_new_notebook_state();
            this.set_notebook_path(undefined);
            this.update_global_view_properties();
            this.current_ie = undefined;
            const ie = this.add_new_ie();  // add a single new interaction_element
            this.set_current_ie(ie);
            this.focus_to_current_ie();
            Change.update_for_clear(this);
            this.set_notebook_unmodified();

            // inform main process of new state
            this.send_tab_state_to_parent_processes();
        }

        async open_notebook_from_path(path, do_import=false, force=false) {
            try {
                if (!force && this.notebook_modified()) {
                    if (! message_controller.confirm_sync('Warning: changes not saved, load new document anyway?')) {
                        return;
                    }
                }
                const load_raw = do_import;
                const { selected_path, contents, fs_timestamp } = await fs_interface.load_file(path, load_raw);
                if (do_import) {
                    await this.import_nb_state(contents);
                } else {
                    const new_nb_state = this.contents_to_nb_state(contents);
                    await this.load_nb_state(new_nb_state);
                    this.set_notebook_path(selected_path, fs_timestamp);
                }
                Change.update_for_open(this, do_import);
                if (!do_import) {
                    this.set_notebook_unmodified();
                }
                this.send_tab_state_to_parent_processes();
            } catch (err) {
                console.error('load failed', err.stack);
                this.set_notebook_path(undefined);  // reset potentially problematic path  //!!! better if we only do this when the path was definitely the problem
                await message_controller.alert(`load failed: ${err.message}\n(initializing empty document)`);
                this.clear_notebook(true);  // initialize empty notebook
            }
        }

        async open_notebook(do_import=false) {
            try {
                if (this.notebook_modified()) {
                    if (! message_controller.confirm_sync('Warning: changes not saved, load new document anyway?')) {
                        return;
                    }
                }
                const path = do_import ? this.constructor.default_load_path : (this.notebook_path ?? this.constructor.default_load_path);
                const load_raw = do_import;
                const load_result = await file_selector.load(path, load_raw);  // may throw an error
                if (!load_result) {
                    // canceled
                    return;
                }
                const { selected_path, contents, fs_timestamp } = load_result;
                if (do_import) {
                    await this.import_nb_state(contents);
                } else {
                    const new_nb_state = this.contents_to_nb_state(contents);
                    await this.load_nb_state(new_nb_state);
                    this.set_notebook_path(selected_path, fs_timestamp);
                }
                Change.update_for_open(this, do_import);
                if (!do_import) {
                    this.set_notebook_unmodified();
                }
                this.send_tab_state_to_parent_processes();
            } catch (err) {
                console.error('load failed', err.stack);
                this.set_notebook_path(undefined);  // reset potentially problematic path  //!!! better if we only do this when the path was definitely the problem
                await message_controller.alert(`load failed: ${err.message}\n(initializing empty document)`);
                this.clear_notebook(true);  // initialize empty notebook
            }
        }

        async save_notebook(interactive=false) {
            let timestamp_mismatch;
            try {
                if (!this.notebook_path || typeof this.notebook_fs_timestamp !== 'number') {
                    timestamp_mismatch = false;
                } else {
                    const current_fs_timestamp = await fs_interface.get_fs_timestamp(this.notebook_path);
                    timestamp_mismatch = (current_fs_timestamp !== this.notebook_fs_timestamp);
                }
            } catch (_) {
                timestamp_mismatch = false;
            }
            try {
                if (timestamp_mismatch) {
                    if (! message_controller.confirm_sync('Warning: notebook file modified by another process, save anyway?')) {
                        return;
                    }
                }
                this.update_nb_state(this.current_ie);  // make sure recent edits are present in this.nb_state
                const contents = this.nb_state_to_contents(this.nb_state);
                if (!interactive && this.notebook_path) {
                    const { selected_path, fs_timestamp } = await fs_interface.save_json(this.notebook_path, contents);
                    this.set_notebook_path(selected_path, fs_timestamp);
                } else {
                    const path = this.notebook_path ?? this.constructor.default_save_path;
                    const save_result = await file_selector.save(path, contents);  // may throw an error
                    if (!save_result) {
                        // canceled
                        return;
                    }
                    const { selected_path, fs_timestamp } = save_result;
                    this.set_notebook_path(selected_path, fs_timestamp);
                }
                this.focus_to_current_ie();
                Change.update_for_save(this);
                this.set_notebook_unmodified();
                this.send_tab_state_to_parent_processes();
            } catch (err) {
                console.error('save failed', err.stack);
                this.set_notebook_path(undefined);  // reset potentially problematic path  //!!! better if we only do this when the path was definitely the problem
                await message_controller.alert(`save failed: ${err.message}`);
            }
        }

        // convert in-memory notebook format to on-disk format
        nb_state_to_contents(state) {
            const contents = {
                ...state,
                order: undefined,
                elements: state.order.map(id => state.elements[id]),
            };
            return contents;
        }

        // convert on-disk notebook format to in-memory format
        contents_to_nb_state(contents) {
            const state = {
                ...contents,
                order: contents.elements.map(e => e.id),
                elements: {},
            };
            for (const e of contents.elements) {
                state.elements[e.id] = e;
            }
            return state;
        }

        // may throw an error
        async load_nb_state(new_nb_state, for_error_recovery=false) {
            // validation
            if ( typeof new_nb_state !== 'object' ||
                 typeof new_nb_state.nb_type    !== 'string' ||
                 typeof new_nb_state.nb_version !== 'string' ||
                 new_nb_state.nb_type    !== this.constructor.nb_type ||
                 new_nb_state.nb_version !== this.constructor.nb_version ||
                 !Array.isArray(new_nb_state.order) ||
                 typeof new_nb_state.elements !== 'object' ||
                 new_nb_state.order.length < 1 ||
                 new_nb_state.order.length !== Object.keys(new_nb_state.elements).length ) {
                throw new Error('unknown notebook state format');
            }

            for (const id of new_nb_state.order) {
                if ( typeof id !== 'string' ||
                     typeof new_nb_state.elements[id] !== 'object' ) {
                    throw new Error('illegal notebook state format');
                }
                const e = new_nb_state.elements[id];
                if ( e.id !== id ||
                     typeof e.input !== 'string' ||
                     !Array.isArray(e.output) ||
                     !e.output.every(output_data => {
                         return ( typeof output_data === 'object' &&
                                  output_handlers[output_data?.type]?.validate_output_data(output_data) );
                     })
                   ) {
                    throw new Error('notebook state has bad data');
                }
            }

            // validation passed; clear the current state and then load the new state
            const prior_state = { current_ie: this.current_ie, nb_state: this.nb_state };  // save in order to restore if there is an error
            this.current_ie = undefined;
            this.set_new_notebook_state();
            this.nb_state.nb_type    = new_nb_state.nb_type;
            this.nb_state.nb_version = new_nb_state.nb_version;

            // load the new state
            try {

                // remove current interaction_element elements
                for (const ie of this.interaction_area.querySelectorAll('.interaction_element')) {
                    this.interaction_area.removeChild(ie);
                }

                this.update_global_view_properties();

                for (const id of new_nb_state.order) {
                    const ie = this.add_new_ie(undefined, true, id);
                    this.set_current_ie(ie, true);
                    const new_nb_data = new_nb_state.elements[id];
                    const nb_data = this.init_nb_state_for_ie_id(ie.id);
                    const output_element_collection = ie.querySelector('.output');
                    this.set_input_text_for_ie_id(ie.id, new_nb_data.input);
                    nb_data.input = new_nb_data.input;
                    // load output elements
                    for (const output_data of new_nb_data.output) {
                        nb_data.output.push(JSON.parse(JSON.stringify(output_data)));  // make a copy
                        const handler = output_handlers[output_data.type];
                        const static_output_element = await handler.generate_static_element(output_data);
                        output_element_collection.appendChild(static_output_element);
                    }
                }
                this.set_current_ie(this.interaction_area.querySelector('.interaction_element'));
                // make sure "selected" cursor is correct
                this.set_ie_selection_state(this.current_ie, true);
                // typeset
                await this.typeset_notebook();
                // set focus
                this.focus_to_current_ie();

            } catch (err) {

                if (!for_error_recovery) {
                    try {
                        await this.load_nb_state(prior_state.nb_state, true);
                        this.set_current_ie(prior_state.current_ie);
                    } catch (err2) {
                        // this should not happen, but if it does do nothing else
                        console.warn('ignoring unexpected secondary error', err2);
                    }
                }
                throw err;

            }
        }

        // may throw an error
        async import_nb_state(contents) {
            this.clear_notebook(true);
            this.set_input_text_for_ie_id(this.current_ie.id, contents);
            this.update_nb_state(this.current_ie);  // make sure contents is present in this.nb_state
        }

        focus_to_current_ie() {
            this.set_input_focus_for_ie_id(this.current_ie.id);
        }

        // if !append_to_end, the new interaction_element is inserted before reference_ie.
        // if !reference_ie, then append_to_end is set to true
        // if existing_ie, then existing_ie is added, not a new one (however, new_ie_id will be set if not undefined)
        add_new_ie(reference_ie, append_to_end=false, new_ie_id=undefined, existing_ie=undefined) {
            if (!reference_ie) {
                append_to_end = true
            }
            // create the required html structure for the interaction_element:
            //
            //     <div class="interaction_element" tabindex="0">
            //         <div class="selected_indicator"></div>
            //         <textarea class="input" tabindex="0"></textarea>
            //         <div class="output"></div>
            //     </div>
            let ie;
            if (existing_ie) {
                ie = existing_ie;
                ie.id = new_ie_id ?? ie.id;
            } else {
                ie = document.createElement('div');
                ie.classList.add('interaction_element');
                ie.id = new_ie_id ?? generate_object_id();
                ie.setAttribute('tabindex', 0);
                const selected_indicator = document.createElement('div');
                selected_indicator.classList.add('selected_indicator');
                ie.appendChild(selected_indicator);
                const input = document.createElement('textarea');
                input.classList.add('input');
                input.setAttribute('tabindex', 0);
                ie.appendChild(input);
                const output = document.createElement('div');
                output.classList.add('output');
                ie.appendChild(output);
            }

            // reset the state of the new ie and initialize
            this.init_nb_state_for_ie_id(ie.id);
            this.establish_internal_state_for_ie_id(ie.id);
            this.init_ie_event_handlers(ie);

            // add new ie to the interaction_area
            // (this must be done before setting up the CodeMirror editor)
            const successor = append_to_end ? null : reference_ie;
            // if successor is null, the new ie will be appended to the end
            this.interaction_area.insertBefore(ie, successor);
            this.update_nb_state_order();

            // set up CodeMirror editor
            // (this needs to be done after the new ie is part of the DOM)
            this.init_ie_codemirror(ie);

            return ie;
        }

        // Convert the textarea in a new ie to a CodeMirror object (cm)
        // and store the new cm in the internal state for ie.
        init_ie_codemirror(ie) {
            const input_textarea = ie.querySelector('.input');
            const cm = CodeMirror.fromTextArea(input_textarea, {
                viewportMargin: Infinity,  // this plus setting height style to "auto" makes the editor auto-resize
                matchBrackets: true,
                mode: 'javascript',  //!!! switch based on buffer format  // defined in codemirror-md+mj-mode.js
            });
            this.update_cm_from_settings(cm, ie);
            ie.querySelector('.CodeMirror').classList.add('input');
            this.get_internal_state_for_ie_id(ie.id).cm = cm;
            cm.on('changes', (instance_cm, changes) => {
                add_edit_change(this, ie.id, changes);
            });
            return cm;
        }
        update_cm_from_settings(cm, ie) {
            if (settings) {  // protect from being called before settings received
                for (const option in settings.editor_options) {
                    const value = (settings.editor_options ?? {})[option];
                    if (typeof value !== 'undefined') {
                        cm.setOption(option, value);
                    }
                }
                if (settings.editor_options.keyMap === 'emacs') {
                    // Guess what? CodeMirror.normalizeKeyMap modifies the given keymap!!  So send a copy....
                    const key_bindings_copy = { ...this.constructor.emacs_special_key_bindings };
                    const normalized_keymap = CodeMirror.normalizeKeyMap(key_bindings_copy);
                    cm.setOption('extraKeys', normalized_keymap);

                    bind_key_handler(ie, this.constructor.emacs_special_key_bindings, {
                        skip_key_event: (event) => {
                            // skip keydown event if it is intended for the editor instance
                            if (document.activeElement.closest('.interaction_element .input')) {
                                return true;  // within element with "input" class
                            }
                            return false;
                        },
                    });
                } else {
                    remove_current_key_handler(ie);
                }
            }

            if (theme_settings) {  // protect from being called before settings received
                const dark_state = ( (settings.theme_colors === 'dark') ||
                                     (settings.theme_colors === 'system' && theme_settings.shouldUseDarkColors) );
                const theme = dark_state ? this.constructor.cm_dark_mode_theme : this.constructor.cm_light_mode_theme;
                cm.setOption('theme', theme);
            }
        }

        remove_ie(ie) {
            this.remove_state_for_ie_id(ie.id);
            this.interaction_area.removeChild(ie);
        }

        set_current_ie(ie, leave_focus_alone=false) {
            if (ie !== this.current_ie) {
                if (this.current_ie) {
                    this.update_nb_state(this.current_ie);
                    this.set_ie_selection_state(this.current_ie, false);
                }
                this.current_ie = ie;
                this.update_nb_state(this.current_ie);
                this.set_ie_selection_state(this.current_ie, true);
            }
            if (!leave_focus_alone) {
                this.focus_to_current_ie();
            }
        }

        set_ie_selection_state(ie, selected) {
            const cl = ie.classList;
            if (selected) {
                cl.add('selected');
            } else {
                cl.remove('selected');
            }
        }

        // Called for newly created (or newly loaded from page HTML) interaction_element
        // elements.  The interaction_element ie must already have an id.
        // Returns this.nb_state.elements[ie.id];
        init_nb_state_for_ie_id(ie_id) {
            this.nb_state.elements[ie_id] = {
                id: ie_id,
                input: '',
                output: [],
            };
            return this.nb_state.elements[ie_id];
        }

        // Resets output ui elements and this.nb_state output for ie.
        // Returns the newly-set empty array for this.nb_state.elements[ie.id].output
        // or undefined if ie.id does not exist in this.nb_state.elements.
        reset_output(ie) {
            const output_element_collection = ie.querySelector('.output');
            while (output_element_collection.firstChild) {
                output_element_collection.removeChild(output_element_collection.lastChild);
            }
            const nb_state_obj = this.nb_state.elements[ie.id];
            if (!nb_state_obj) {
                return undefined;
            } else {
                const empty_output_data_collection = [];
                nb_state_obj.output = empty_output_data_collection;
                return empty_output_data_collection;
            }
        }

        update_nb_state(ie) {
            // assume that every interaction element has a (uuid) id, and that it has
            // a corresponding entry in this.nb_state.
            const ie_data = this.nb_state.elements[ie.id];
            ie_data.input = this.get_input_text_for_ie_id(ie.id);
        }

        update_nb_state_order() {
            this.nb_state.order = [ ...this.interaction_area.querySelectorAll('.interaction_element') ].map(e => e.id);
        }


        // === EVALUATION ===

        // Returns true iff no errors.
        async evaluate_ie(ie, stay=false) {
            this.update_nb_state(ie);

            const output_data_collection = this.reset_output(ie);
            try {

                const input_text = this.get_input_text_for_ie_id(ie.id);
                await this.evaluate_input_text(ie, output_data_collection, input_text);

            } catch (err) {

                await output_handlers.error.update_notebook(ie, output_data_collection, err);
                if (err instanceof TextuallyLocatedError) {
                    this.set_input_selection_for_ie_id(ie.id, err.line_col);
                }
                const output_element_collection = ie.querySelector('.output');
                output_element_collection.scrollIntoView(false);  // show error
                return false;
            }

            add_ie_output_change(this, ie.id);

            await this.typeset_notebook(ie);

            if (!stay) {
                // move to next interaction_element, or add a new one if at the end
                const next_ie = ie.nextElementSibling;
                if (next_ie) {
                    this.set_current_ie(next_ie);
                } else {
                    perform_add_new_after_ie_change(this, ie.id);
                }
            }

            return true;
        }

        // may throw an error
        async evaluate_input_text(ie, output_data_collection, input_text) {
            let is_expression, text;
            const mdmj_header_match = input_text.match(this.constructor._input_text_type_header_re);
            if (mdmj_header_match) {
                is_expression = false;
                text = input_text.substring(mdmj_header_match[0].length + 1);
            } else {
                is_expression = true;
                text = input_text;
            }
            if (text.length > 0) {
                if (is_expression) {
                    const eval_worker = new EvalWorker(ie, output_data_collection, text);
                    this.set_eval_worker_for_ie_id(ie.id, eval_worker);
                } else {  // markdown
                    await output_handlers.text.update_notebook(ie, output_data_collection, text);
                }
            }
        }

        async typeset_notebook(single_ie=undefined) {
            const ie_update_list = single_ie ? [single_ie] : this.nb_state.order.map(id => document.getElementById(id));
            if (is_MathJax_v2) {
                const tasks = [];
                if (single_ie) {
                    // typeset one element of notebook
                    tasks.push(['Typeset', MathJax.Hub, single_ie]);
                    tasks.push([this.process_markdown.bind(this), single_ie]);
                } else {
                    // typeset entire notebook
                    tasks.push(['Typeset', MathJax.Hub]);
                    tasks.push(() => {
                        for (const ie of ie_update_list) {
                            this.process_markdown(ie);
                        }
                    });
                }
                let set_completed;
                const done_promise = new Promise(resolve => { set_completed = resolve; });
                tasks.push(set_completed);
                MathJax.Hub.Queue(...tasks);
                await done_promise;
            } else {  // MathJax version 3
                await MathJax.typesetPromise();
                // process markdown *after* MathJax processing...
                for (const ie of ie_update_list) {
                    this.process_markdown(ie);
                }
            }
        }

        process_markdown(ie) {
            // process markdown in ie after it has been typeset by MathJax
            const output_element_collection = ie.querySelector('.output');
            for (const child of output_element_collection.children) {
                if (child.classList.contains(TEXT_ELEMENT_CLASS)) {
                    const text = child.innerHTML;
                    child.innerHTML = marked(text);
                }
            }
        }
    }

    facet_export({
        Notebook,
    });


} catch (err) { facet_load_error(err, current_script); } })(facet_init());  // facet end
