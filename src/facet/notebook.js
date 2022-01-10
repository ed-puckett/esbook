'use strict';

(async ({ current_script, facet, facet_export, facet_load_error }) => { try {  // facet begin

    // === CONSTANTS ===

    const NB_TYPE    = 'esbook';
    const NB_VERSION = '1.0.0';

    const DEFAULT_SAVE_PATH = 'new-notebook.esbook';

    const CM_DARK_MODE_THEME  = 'blackboard';
    const CM_LIGHT_MODE_THEME = 'default';


    // === EXTERNAL MODULES ===

    const fs_interface = await facet('facet/fs-interface.js');

    const {
        AlertDialog,
        ConfirmDialog,
    } = await facet('facet/dialog.js');

    const { beep } = await facet('facet/beep.js');

    const {
        marked,
        is_MathJax_v2,
        MathJax,
    } = await facet('facet/md+mj.js');

    const { SettingsUpdatedEvent      } = await facet('facet/notebook/settings.js');
    const { ThemeSettingsUpdatedEvent } = await facet('facet/notebook/theme-settings.js');

    const {
        SettingsDialog,
    } = await facet('facet/notebook/settings-dialog.js');

    const {
        KeyBindingCommandEvent,
    } = await facet('facet/notebook/key-bindings.js');

    const {
        TEXT_ELEMENT_CLASS,
        clean_for_html,
        output_handlers,
    } = await facet('facet/notebook/output-handlers.js');

    const {
        ie_hide_input_css_class,
        ie_get_hide_input_state,
        ie_set_hide_input_state,
        ie_get_is_dialog_state,
        create_output_context,
    } = await facet('facet/notebook/output-context.js');

    const svg_image_util = await facet('facet/notebook/svg-image-util.js');

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

    const {
        get_recents,
        add_to_recents,
        clear_recents,
    } = await facet('facet/notebook/recents.js');


    // === NOTEBOOK INSTANCE ===

    let notebook;  // initialized by document_ready then clause below


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

    const notebook_ready = new Promise((resolve, reject) => {
        try {

            // We are using MathJax v2.7.x instead of v3.x.x because Plotly
            // (used in ./output-handlers.js) still requires the older version.
            // We want to upgrade when Plotly supports it.

            if (document.readyState !== 'loading') {
                resolve();
            } else {
                document.addEventListener('DOMContentLoaded', (event) => {
                    resolve()
                }, {
                    once: true,
                });
            }

        } catch (err) {
            reject(err);
        }
    }).then(async () => {

        if (!is_MathJax_v2) {
            // only available in MathJax v3
            await MathJax.startup.promise;
        }
        notebook = new Notebook();
        await notebook.setup();
        notebook.update_from_settings();  // in case setting update already received

    });


    // === NOTEBOOK CLASS ===


    class Notebook {
        static nb_type    = NB_TYPE;
        static nb_version = NB_VERSION;

        static default_save_path = DEFAULT_SAVE_PATH;

        static cm_dark_mode_theme  = CM_DARK_MODE_THEME;
        static cm_light_mode_theme = CM_LIGHT_MODE_THEME;

        static sym_eval_state = Symbol.for('eval_state');

        // if present, then the input following is markdown+MathJax
        static _input_mdmj_header_sequence = '%';  // if this sequence occurs on first line after optional whitespace, then md+mj mode
        static _input_mdmj_header_re = new RegExp(`^\\s*${this._input_mdmj_header_sequence}.*\$`, 'mi');

        // CSS class for ie when in md+mj mode
        static _ie_mdmj_mode_css_class = 'mdmj';

        // CSS class for ie when it should automatically hide
        static _ie_autohide_mode_css_class = 'autohide';

        // If this keyword appears in a JavaScript comment on the first line
        // of the first interaction element, and the input is not in md+mj
        // mode, then that first cell will be automatically evaluated
        // when loading the notebook.
        static _input_autoeval_initial_comment_keyword = 'autoeval';
        static _input_autoeval_initial_comment_re      = new RegExp(`^\\s*//\\s*${this._input_autoeval_initial_comment_keyword}(\\W.*$|$)`, 'i');

        // async setup/initialization (to be called immediately after construction)
        async setup() {
            // notebook source information
            this.notebook_file_handle  = undefined;
            this.notebook_file_stats   = undefined;  // stats from when last loaded/saved, or undefined

            // notebook persistent state
            this.nb_state              = undefined;  // persisted state; first initialized below when this.clear_notebook() is called
            this.internal_nb_state     = undefined;  // not persisted;   first initialized below when this.clear_notebook() is called

            this._loaded_notebook_hash = undefined;  // used by this.set_notebook_unmodified() and this.notebook_modified()

            this.interaction_area      = undefined;  // will be set in this._setup_document()

            // notebook focus
            this.current_ie = undefined;  // initialized below

            try {

                await this._initialize_document();

                // replace CodeMirror undo/redo with our implementation
                CodeMirror.commands.undo = (cm) => Change.perform_undo(this);
                CodeMirror.commands.redo = (cm) => Change.perform_redo(this);

                this.init_event_handlers();

                // initialize empty notebook
                await this.clear_notebook(true);

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

            const content_el = globalThis.core.create_child_element(document.body, 'div', { id: 'content' });
            this.interaction_area = globalThis.core.create_child_element(content_el, 'div', { id: 'interaction_area' });

            // add notebook stylesheet:
            const stylesheet_url = new URL('notebook/notebook.css', current_script.src);
            globalThis.core.create_stylesheet_link(document.head, stylesheet_url);

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
                await globalThis.core.load_script(document.head, script_url);
            }

            // load CodeMirror stylesheets:
            for (const stylesheet_path of [
                '../../node_modules/codemirror/lib/codemirror.css',
                '../../node_modules/codemirror/theme/blackboard.css',
                '../../node_modules/codemirror/addon/dialog/dialog.css',
            ]) {
                const stylesheet_url = new URL(stylesheet_path, current_script.src);
                globalThis.core.create_stylesheet_link(document.head, stylesheet_url);
            }
        }

        _object_hasher(obj) {
            return globalThis.core.sha256(JSON.stringify(obj));
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

        // called exactly once (by setup())
        init_event_handlers() {
            KeyBindingCommandEvent.subscribe((event) => this.handle_command(event.command));

            window.onbeforeunload = (event) => {
                // On Chromium, don't try any of the typical things like event.preventDefault()
                // or setting event.returnValue, they won't work.  Simply return something truthy
                // to cause a user warning to be shown.
                if (this.notebook_modified()) {
                    return true;
                }
            };

        }

        init_ie_event_handlers(ie) {
            ie.addEventListener('click', this._ie_click_handler.bind(this), true);
        }
        _ie_click_handler(event) {
            const ie = event.target.closest('.interaction_element');
            if (ie_get_is_dialog_state(ie)) {
                return;  // don't handle; causes checkboxes in output areas to fail
            }
            if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
                this.set_current_ie(ie, true);
            }
            event.preventDefault();
            event.stopPropagation();
        }

        // Set a new notebook source information and update things accordingly.
        set_notebook_source(file_handle, stats=undefined) {
            this.notebook_file_handle = file_handle;
            this.notebook_file_stats  = stats;

            if (file_handle) {
                add_to_recents(file_handle);  //!!! not waiting for this async function...
            }

            let title = 'Untitled';
            if (stats) {
                title = stats.name;
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
            // internal_nb_state is internal state for each ie indexed by ie.id
            // plus one more slot at Symbol.from(
            this.internal_nb_state = {
                [this.constructor.sym_eval_state]: {},  // eval_state for notebook
            };
        }

        reset_eval_state() {
            this.internal_nb_state[this.constructor.sym_eval_state] = {};
        }
        get_eval_state() {
            return this.internal_nb_state[this.constructor.sym_eval_state];
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
            // set focus on next tick, otherwise it doesn't stick...
            const internal_state = this.get_internal_state_for_ie_id(ie_id);
            if (internal_state) {
                setTimeout(() => internal_state.cm.focus());
            }
        }

        handle_command(command) {
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
                this.clear_notebook();  //!!! not waiting for this async function...
                break;
            }
            case 'open_notebook': {
                const do_import = false;
                this.open_notebook(do_import);  //!!! not waiting for this async function...
                break;
            }
            case 'import_notebook': {
                const do_import = true;
                this.open_notebook(do_import);  //!!! not waiting for this async function...
                break;
            }
            case 'reopen_notebook': {
                if (!this.notebook_file_handle) {
                    this.clear_notebook();  //!!! not waiting for this async function...
                } else {
                    const do_import = false;
                    const force     = false;
                    this.open_notebook_from_file_handle(this.notebook_file_handle, do_import, force);  //!!! not waiting for this async function...
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
            case 'settings': {
                new SettingsDialog().run();
                break;
            }
            case 'open_last_recent': {//!!!
                get_recents().then(recents => {
                    if (recents.length > 0) {
                        this.open_notebook_from_file_handle(recents[0]);  //!!! not waiting for this async function...
                    } else {
                        beep();
                    }
                });
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
            this.reset_eval_state();
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
        async clear_notebook(force=false) {
            if (!force && this.notebook_modified()) {
                if (! await ConfirmDialog.run('Warning: changes not saved, clear document anyway?')) {
                    return;
                }
            }

            // remove all current interaction_element elements
            for (const ie of this.interaction_area.querySelectorAll('.interaction_element')) {
                this.interaction_area.removeChild(ie);
            }

            // reset state
            this.set_new_notebook_state();
            this.set_notebook_source(undefined);
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

        async open_notebook_from_file_handle(file_handle, do_import=false, force=false) {
            try {
                if (!force && this.notebook_modified()) {
                    if (! await ConfirmDialog.run('Warning: changes not saved, load new document anyway?')) {
                        return;
                    }
                }
                if (do_import) {
                    const { text, stats } = await fs_interface.open_text(file_handle);
                    await this.import_nb_state(text);
                    this.set_notebook_source(undefined);
                } else {
                    const { contents, stats } = await fs_interface.open_json(file_handle);
                    const new_nb_state = this.contents_to_nb_state(contents);
                    await this.load_nb_state(new_nb_state);
                    this.set_notebook_source(file_handle, stats);
                }
                Change.update_for_open(this, do_import);
                if (!do_import) {
                    this.set_notebook_unmodified();
                    // check if this notebook is "autoeval"
                    await this._handle_autoeval();
                }
                this.send_tab_state_to_parent_processes();

            } catch (err) {
                console.error('open failed', err.stack);
                this.set_notebook_source(undefined);  // reset potentially problematic source info
                await AlertDialog.run(`open failed: ${err.message}\n(initializing empty document)`);
                await this.clear_notebook(true);  // initialize empty notebook
            }
        }

        async open_notebook(do_import=false) {
            try {
                if (this.notebook_modified()) {
                    if (! await ConfirmDialog.run('Warning: changes not saved, load new document anyway?')) {
                        return;
                    }
                }
                const open_dialog_options = do_import
                      ? {
                          description: 'JavaScript files',
                          accept: {
                              'text/javascript': ['.js'],
                          },
                      }
                      : {
                          description: 'esbook files',
                          accept: {
                              'application/x-esbook': ['.esbook', '.esb'],
                          },
                      };
                const { canceled, file_handle } = await fs_interface.prompt_for_open(open_dialog_options)
                if (!canceled) {
                    await this.open_notebook_from_file_handle(file_handle, do_import, true);
                }

            } catch (err) {
                console.error('open failed', err.stack);
                this.set_notebook_source(undefined);  // reset potentially problematic source info
                await AlertDialog.run(`open failed: ${err.message}\n(initializing empty document)`);
                await this.clear_notebook(true);  // initialize empty notebook
            }
        }

        async save_notebook(interactive=false) {
            let timestamp_mismatch;
            try {
                const last_fs_timestamp = this.notebook_file_stats?.last_modified;
                if (!this.notebook_file_handle || typeof last_fs_timestamp !== 'number') {
                    timestamp_mismatch = false;
                } else {
                    const stats = await fs_interface.get_fs_stats_for_file_handle(this.notebook_file_handle);//!!!
                    const current_fs_timestamp = stats.last_modified;
                    timestamp_mismatch = (current_fs_timestamp !== last_fs_timestamp);
                }
            } catch (_) {
                timestamp_mismatch = false;
            }
            try {
                if (timestamp_mismatch) {
                    if (! await ConfirmDialog.run('Warning: notebook file modified by another process, save anyway?')) {
                        return;
                    }
                }
                this.update_nb_state(this.current_ie);  // make sure recent edits are present in this.nb_state
                const contents = this.nb_state_to_contents(this.nb_state);
                if (!interactive && this.notebook_file_handle) {
                    const file_handle = this.notebook_file_handle;
                    const stats = await fs_interface.save_json(file_handle, contents);
                    this.set_notebook_source(file_handle, stats);
                } else {
                    const save_dialog_options = {
                        description: 'esbook files',
                        accept: {
                            'application/x-esbook': ['.esbook', '.esb'],
                        },
                    };
                    const { canceled, file_handle } = await fs_interface.prompt_for_save(save_dialog_options);
                    if (canceled) {
                        // return with nothing changed
                        return;
                    }
                    const stats = await fs_interface.save_json(file_handle, contents);  // may throw an error
                    this.set_notebook_source(file_handle, stats);
                }
                this.focus_to_current_ie();
                Change.update_for_save(this);
                this.set_notebook_unmodified();
console.log('>>> SAVED');//!!!
                this.send_tab_state_to_parent_processes();

            } catch (err) {
                console.error('save failed', err.stack);
                this.set_notebook_source(undefined);  // reset potentially problematic source info
                await AlertDialog.run(`save failed: ${err.message}`);
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
                        if (static_output_element) {
                            output_element_collection.appendChild(static_output_element);
                        }
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
        async import_nb_state(text) {
            await this.clear_notebook(true);
            this.set_input_text_for_ie_id(this.current_ie.id, text);
            this.update_nb_state(this.current_ie);  // make sure new text is present in this.nb_state
        }

        async _handle_autoeval() {
            const first_ie_id = this.nb_state.order[0];
            if (first_ie_id) {
                const cm = this.get_internal_state_for_ie_id(first_ie_id).cm;
                const first_line_trimmed = cm.getLine(0).trim();
                const mdmj_mode = first_line_trimmed.startsWith(this.constructor._input_mdmj_header_sequence);
                if (!mdmj_mode) {
                    const should_autoeval = first_line_trimmed.match(this.constructor._input_autoeval_initial_comment_re);
                    if (should_autoeval) {
                        const first_ie = document.getElementById(first_ie_id);
                        const stay = true;
                        await this.ie_ops_eval_element(first_ie, stay);
                    }
                }
            }
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
                ie.id = new_ie_id ?? globalThis.core.generate_object_id();
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
            const internal_state = this.get_internal_state_for_ie_id(ie.id);
            internal_state.cm = cm;
            cm.on('changes', (instance_cm, changes) => {
                add_edit_change(this, ie.id, changes);
                // check for mode update:
                if (changes.some(c => (c.from.line === 0 || c.to.line === 0))) {
                    // change affected first line; check if mode changed
                    const mdmj_mode = cm.getLine(0).trim().startsWith(this.constructor._input_mdmj_header_sequence);
                    if (!!internal_state.mdmj_mode !== !!mdmj_mode) {
                        internal_state.mdmj_mode = mdmj_mode;
                        if (mdmj_mode) {
                            ie.classList.add(this.constructor._ie_mdmj_mode_css_class);
                            cm.setOption('mode', 'md+mj');
                        } else {
                            ie.classList.remove(this.constructor._ie_mdmj_mode_css_class);
                            cm.setOption('mode', 'javascript');
                        }
                    }
                }
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
        // Completely replaces the .output child.
        // Returns the newly-set empty array for this.nb_state.elements[ie.id].output
        // or undefined if ie.id does not exist in this.nb_state.elements.
        reset_output(ie) {
            const old = ie.querySelector('.output');
            const output_element_collection = document.createElement(old.tagName);
            output_element_collection.classList = old.classList;
            old.replaceWith(output_element_collection);
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
            const output_context = create_output_context(ie, output_data_collection);

            try {

                const input_text = this.get_input_text_for_ie_id(ie.id);
                const eval_worker = await this.evaluate_input_text(output_context, input_text);
                if (eval_worker) {
                    this.set_eval_worker_for_ie_id(ie.id, eval_worker);
                }

            } catch (err) {

                await output_handlers.error.update_notebook(output_context, err);
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
        // returns the new active EvalWorker instance or undefined if none
        async evaluate_input_text(output_context, input_text) {
            let is_expression, text;
            const mdmj_header_match = input_text.match(this.constructor._input_mdmj_header_re);
            if (mdmj_header_match) {
                is_expression = false;
                text = input_text.substring(mdmj_header_match[0].length + 1);
            } else {
                is_expression = true;
                text = input_text;
            }
            if (text.length > 0) {
                if (is_expression) {
                    return await EvalWorker.eval(this.get_eval_state(), output_context, text);
                } else {  // markdown
                    await output_handlers.text.update_notebook(output_context, text);
                    return undefined;  // indicate: no EvalWorker instance
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


    // === EXPORT ===

    facet_export({
        notebook_ready,
    });

} catch (err) { facet_load_error(err, current_script); } })(globalThis.core.facet_init());  // facet end
