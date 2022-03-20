// === CONSTANTS ===

const NB_TYPE    = 'esbook';
const NB_VERSION = '2.0.0';
const COMPATIBLE_NB_VERSION_RES = [ /^[1-2][.][0-9]+[.][0-9]+$/ ]

const DEFAULT_SAVE_PATH = 'new-notebook.esbook';

const DEFAULT_TITLE = 'Untitled';

const CM_DARK_MODE_THEME  = 'blackboard';
const CM_LIGHT_MODE_THEME = 'default';


// === EXTERNAL MODULES ===

const current_script_url = import.meta.url;

const {
    show_initialization_failed,
    escape_for_html,
    load_script,
    create_child_element,
    create_stylesheet_link,
} = await import('./dom-util.js');

const {
    generate_object_id,
} = await import('./uuid.js');

const {
    sha256,
} = await import('./sha.js');

const { fs_interface } = await import('./fs-interface.js');

const { beep } = await import('./beep.js');

const { AlertDialog, ConfirmDialog } = await import('./dialog.js');

const { SettingsDialog } = await import('./notebook/settings-dialog.js');

const {
    get_settings,
    SettingsUpdatedEvent,
    analyze_formatting_options,
} = await import('./notebook/settings.js');

const {
    get_theme_settings,
    ThemeSettingsUpdatedEvent,
} = await import('./notebook/theme-settings.js');

const {
    KeyBindingCommandEvent,
} = await import('./notebook/key-bindings.js');

const {
    MenuCommandEvent,
    MenuBar,
} = await import('./notebook/menu.js');

const {
    open_help_window,
} = await import('./notebook/help-window.js');

const {
    marked,
    MathJax,
    is_MathJax_v2,
} = await import('./mdmj.js');

const {
    TEXT_ELEMENT_CLASS,
    clean_for_html,
    output_handlers,
} = await import('./notebook/output-handlers.js');

const {
    create_output_context,
} = await import('./notebook/output-context.js');

const {
    Change,
    add_edit_change,
    perform_move_up_ie_change,
    perform_move_down_ie_change,
    perform_add_new_ie_at_position_change,
    perform_add_new_before_ie_change,
    perform_add_new_after_ie_change,
    perform_delete_ie_change,
    perform_state_change,
    add_ie_output_change,
} = await import('./notebook/change.js');

const {
    get_recents,
    add_to_recents,
} = await import('./notebook/recents.js');

const {
    TextuallyLocatedError,
    EvalAgent,
} = await import('./notebook/eval-agent.js');

const {
    EvalWorker,
} = await import('./notebook/eval-worker.js');

const {
    initializing_data_element_id,
    create_exported_notebook,
} = await import('./notebook/create-exported-notebook.mjs');


// === NOTEBOOK INSTANCE ===

let notebook;  // initialized by document_ready then clause below


// === SETTINGS ===

let settings        = get_settings();        // updated by SettingsUpdatedEvent event
let theme_settings  = get_theme_settings();  // updated by ThemeSettingsUpdatedEvent event

SettingsUpdatedEvent.subscribe((event) => {
    settings = event.get_settings();
    notebook?.update_from_settings();
});

ThemeSettingsUpdatedEvent.subscribe((event) => {
    theme_settings = event.get_theme_settings();
    notebook?.update_from_settings();
});


// === NOTEBOOK LOAD BOOTSTRAP ===

export const notebook_ready = new Promise((resolve, reject) => {
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
    notebook.update_from_settings();  // in case settings update already received

});


// === NOTEBOOK CLASS ===

class Notebook {
    static nb_type    = NB_TYPE;
    static nb_version = NB_VERSION;

    static compatible_nb_version_res = COMPATIBLE_NB_VERSION_RES;

    static default_save_path = DEFAULT_SAVE_PATH;

    static default_title = DEFAULT_TITLE;

    static cm_dark_mode_theme  = CM_DARK_MODE_THEME;
    static cm_light_mode_theme = CM_LIGHT_MODE_THEME;

    static sym_eval_state   = Symbol.for('eval_state');
    static sym_eval_workers = Symbol.for('eval_workers');

    // CSS class for ie when in mdmj mode
    static _ie_autohide_css_class = 'autohide';

    static detect_ie_modes(first_line) {
        // eliminate subsequent lines, if any
        const newline_pos = first_line.indexOf('\n');
        if (newline_pos >= 0) {
            first_line = first_line.substring(0, newline_pos);
        }
        const result = {};
        const trimmed = first_line.trim();
        if (trimmed.startsWith('//')) {
            result.javascript = true;
            const parts = trimmed.split(/\s+/);
            for (let i = 1; i < parts.length; i++) {
                const token = parts[i].toLowerCase();
                switch (token) {
                case 'autoeval':
                case 'autohide':
                    result[token] = true;
                }
            }
        } else {
            result.mdmj = true;
            result.autohide = true;
        }
        return result;
    }

    // async setup/initialization (to be called immediately after construction)
    async setup() {
        // Notebook source information.
        // When FileSystemFileHandle and APIs not available (indicated by
        // !fs_interface.fsaapi_available), then this.notebook_file_handle
        // will always be undefined.  However, this.notebook_file_stats might
        // be set to hold things like name (in the case of legacy fallback).
        this.notebook_file_handle  = undefined;  // if set, a FileSystemFileHandle
        this.notebook_file_stats   = undefined;  // stats from when last loaded/saved, or undefined

        // notebook persistent state
        this.nb_state              = undefined;  // persisted state; first initialized below when this.clear_notebook() is called
        this.internal_nb_state     = undefined;  // not persisted;   first initialized below when this.clear_notebook() is called

        this._loaded_notebook_hash = undefined;  // used by this.set_notebook_unmodified() and this.notebook_modified()

        this.controls              = undefined;  // will be set in this._setup_document()
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

            // initialize from embedded data contained in an element
            // with id = initializing_data_element_id, if any
            await this.initialize_from_embedded_data();

        } catch (error) {
            show_initialization_failed(error);
            throw error;
        }
    }

    async initialize_from_embedded_data() {
        const initializing_data_el = document.getElementById(initializing_data_element_id);
        if (initializing_data_el) {
            let initializing_nb_state;
            try {
                const initializing_contents_json = atob(initializing_data_el.innerText.trim());
                const initializing_contents = JSON.parse(initializing_contents_json);
                initializing_nb_state = this.contents_to_nb_state(initializing_contents);
            } catch (err) {
                throw new Error(`corrupt initializing data contained in document; element id: ${initializing_data_element_id}`);
            }
            initializing_data_el.remove();  // remove the initializing element
            await this.load_nb_state(initializing_nb_state);
            Change.update_for_open(this);  // do this before this.set_notebook_unmodified()
            this.set_notebook_unmodified();
            // check if this notebook is "autoeval"
            await this._handle_autoeval();
        }
    }

    async _initialize_document() {
        if (document.getElementById('content')) {
            throw new Error('initial document must not contain an element with id "content"');
        }

        // add initial notebook structure to document body:
        //
        //     <div id="content">
        //         <div id="controls">
        //             ... menu ...
        //             <div id="indicators">
        //                 <div id="modified_indicator"></div>
        //                 <div id="running_indicator"></div>
        //                 <div id="formatting_indicator"></div>
        //             </div>
        //         </div>
        //         <div id="interaction_area">
        //             ...
        //         </div>
        //     </div>

        const content_el = create_child_element(document.body, 'div', { id: 'content' });

        this.controls         = create_child_element(content_el, 'div', { id: 'controls' });
        this.interaction_area = create_child_element(content_el, 'div', { id: 'interaction_area' });

        const indicators_el = create_child_element(this.controls, 'div', { id: 'indicators' });
        this.modified_indicator = create_child_element(indicators_el, 'div', { id: 'modified_indicator', title: 'Modified' });
        this.running_indicator  = create_child_element(indicators_el, 'div', { id: 'running_indicator',  title: 'Running' });
        this.formatting_indicator  = create_child_element(indicators_el, 'div', { id: 'formatting_indicator',  title: 'Formatting' });

        // add notebook stylesheet:
        const stylesheet_url = new URL('notebook/notebook.css', import.meta.url);
        create_stylesheet_link(document.head, stylesheet_url);

        // add menu stylesheet:
        const menu_stylesheet_url = new URL('notebook/menu/menu.css', import.meta.url);
        create_stylesheet_link(document.head, menu_stylesheet_url);

        // load CodeMirror stylesheets:
        for (const stylesheet_path of [
            '../node_modules/codemirror/lib/codemirror.css',
            '../node_modules/codemirror/theme/blackboard.css',
            '../node_modules/codemirror/addon/dialog/dialog.css',
        ]) {
            const stylesheet_url = new URL(stylesheet_path, import.meta.url);
            create_stylesheet_link(document.head, stylesheet_url);
        }

        // load CodeMirror scripts:
        async function load_cm_script(script_path) {
            const script_url = new URL(script_path, import.meta.url);
            return load_script(document.head, script_url);
        }
        await load_cm_script('../node_modules/codemirror/lib/codemirror.js');
        await Promise.all(
            [
                '../node_modules/codemirror/mode/markdown/markdown.js',
                '../node_modules/codemirror/mode/stex/stex.js',
                '../node_modules/codemirror/mode/javascript/javascript.js',
                '../node_modules/codemirror/keymap/emacs.js',
                '../node_modules/codemirror/keymap/sublime.js',
                '../node_modules/codemirror/keymap/vim.js',
                '../node_modules/codemirror/addon/dialog/dialog.js',
                '../node_modules/codemirror/addon/search/search.js',
                '../node_modules/codemirror/addon/search/searchcursor.js',
                '../node_modules/codemirror/addon/search/jump-to-line.js',
                '../node_modules/codemirror/addon/edit/matchbrackets.js',
            ].map(load_cm_script)
        );
        await load_cm_script('notebook/codemirror-mdmj-mode.js');

        this.menubar = await MenuBar.create(this.controls);
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

    // called exactly once (by setup())
    init_event_handlers() {
        KeyBindingCommandEvent.subscribe(async (event) => this.handle_command(event.command));
        MenuCommandEvent.subscribe(async (event) => this.handle_command(event.command));

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
        if (!event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
            const ie = event.target.closest('.interaction_element');
            this.set_current_ie(ie, true);
        }
        if (!event.target.closest('.interaction_element .output')) {
            // don't change propagation if target is in output area,
            // otherwise this causes checkboxes & buttons in output areas
            // to not respond to clicks
            event.preventDefault();
            event.stopPropagation();
        }
    }

    set_modified_status(state) {
        if (state) {
            this.modified_indicator.classList.add('active');
            this.modified_indicator.title = 'Modified';
        } else {
            this.modified_indicator.classList.remove('active');
            this.modified_indicator.title = 'Not modified';
        }
    }
    set_running_status(state) {
        if (state) {
            this.running_indicator.classList.add('active');
            this.running_indicator.title = 'Running';
        } else {
            this.running_indicator.classList.remove('active');
            this.running_indicator.title = 'Not running';
        }
    }
    set_formatting_status(state) {
        if (state) {
            this.formatting_indicator.classList.add('active');
            this.formatting_indicator.title = 'Formatting';
        } else {
            this.formatting_indicator.classList.remove('active');
            this.formatting_indicator.title = 'Formatting complete';
        }
    }


    // Set a new notebook source information and update things accordingly.
    async set_notebook_source(file_handle, stats=undefined) {
        this.notebook_file_handle = undefined;
        this.notebook_file_stats  = undefined;

        if (file_handle) {
            if (!stats) {
                throw new Error('file_handle given without stats');
            }
            await add_to_recents({ file_handle, stats });
            await this.menubar.rebuild_recents();
        }

        this.notebook_file_handle = file_handle;
        this.notebook_file_stats  = stats;

        let title = document.title || this.constructor.default_title;
        if (stats?.name) {
            title = stats.name;
        }
        document.title = title;
    }

    // Set a new empty state for the notebook (also calls reset_eval_state())
    reset_notebook_state() {
        this.nb_state = {
            nb_type:    this.constructor.nb_type,
            nb_version: this.constructor.nb_version,
            order:    [],  // interaction_element ids, in order of appearance in notebook
            elements: {},  // the actual interaction_element data, indexed by interaction_element id
        };
        // internal_nb_state is internal state for each ie indexed by ie.id
        // plus two more slots (at sym_eval_state and sym_eval_workers)
        this.internal_nb_state = {};
        this.reset_eval_state();
    }

    set_formatting_options_for_ie_id(ie_id, formatting_options) {
        const complaint = analyze_formatting_options(formatting_options);
        if (complaint) {
            throw new Error(complaint);
        }
        this.nb_state.elements[ie_id].formatting_options = JSON.parse(JSON.stringify(formatting_options));  // make a copy
    }
    get_formatting_options_for_ie_id(ie_id) {
        return this.nb_state.elements[ie_id].formatting_options;
    }

    reset_eval_state() {
        for (const eval_worker of this.internal_nb_state[this.constructor.sym_eval_workers] ?? []) {
            try {
                eval_worker.terminate();
            } catch (_) {
                // nothing...
            }
        }

        this.internal_nb_state[this.constructor.sym_eval_state]   = {};  // eval_state for notebook
        this.internal_nb_state[this.constructor.sym_eval_workers] = [];  // EvalWorker instances for notebook
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
        this.remove_eval_agent_for_ie_id(ie_id);
        delete this.internal_nb_state[ie_id];
    }

    remove_eval_agent_for_ie_id(ie_id) {
        const internal_state = this.get_internal_state_for_ie_id(ie_id);
        if (internal_state) {
            internal_state.eval_agent?.stop();  // stop old eval_agent, if any
            internal_state.eval_agent = undefined;
        }
    }
    set_eval_agent_for_ie_id(ie_id, eval_agent) {
        this.remove_eval_agent_for_ie_id(ie_id);
        const internal_state = this.establish_internal_state_for_ie_id(ie_id);
        internal_state.eval_agent = eval_agent;
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

    async handle_command(command) {
        this.menubar.deactivate();  // just in case

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
            await this.clear_notebook();
            break;
        }
        case 'open_notebook': {
            const do_import = false;
            await this.open_notebook(do_import);
            break;
        }
        case 'import_notebook': {
            const do_import = true;
            await this.open_notebook(do_import);
            break;
        }
        case 'reopen_notebook': {
            if (!this.notebook_file_handle) {
                await this.clear_notebook();
            } else {
                const do_import = false;
                const force     = false;
                await this.open_notebook_from_file_handle(this.notebook_file_handle, do_import, force);
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
        case 'export_notebook': {
            this.export_notebook();
            break;
        }
        case 'eval_element': {
            if (!this.current_ie) {
                beep();
            } else {
                this.ie_ops_eval_element(this.current_ie, false);
            }
            break;
        }
        case 'eval_stay_element': {
            if (!this.current_ie) {
                beep();
            } else {
                this.ie_ops_eval_element(this.current_ie, true);
            }
            break;
        }
        case 'eval_notebook': {
            if (!this.current_ie) {
                beep();
            } else {
                this.ie_ops_eval_notebook();
            }
            break;
        }
        case 'eval_notebook_before': {
            if (!this.current_ie) {
                beep();
            } else {
                this.ie_ops_eval_notebook(this.current_ie, true);
            }
            break;
        }
        case 'focus_up_element': {
            const ie_to_focus = this.current_ie?.previousElementSibling ?? this.current_ie;
            if (!ie_to_focus) {
                beep();
            } else {
                this.set_current_ie(ie_to_focus);
            }
            break;
        }
        case 'focus_down_element': {
            const ie_to_focus = this.current_ie?.nextElementSibling ?? this.current_ie;
            if (!ie_to_focus) {
                beep();
            } else {
                this.set_current_ie(ie_to_focus);
            }
            break;
        }
        case 'move_up_element': {
            if (!this.current_ie) {
                beep();
            } else {
                perform_move_up_ie_change(this, this.current_ie.id);
            }
            break;
        }
        case 'move_down_element': {
            if (!this.current_ie) {
                beep();
            } else {
                perform_move_down_ie_change(this, this.current_ie.id);
            }
            break;
        }
        case 'add_before_element': {
            if (!this.current_ie) {
                perform_add_new_ie_at_position_change(this, 0);
            } else {
                perform_add_new_before_ie_change(this, this.current_ie.id);
            }
            break;
        }
        case 'add_after_element': {
            if (!this.current_ie) {
                perform_add_new_ie_at_position_change(this, 0);
            } else {
                perform_add_new_after_ie_change(this, this.current_ie.id);
            }
            break;
        }
        case 'delete_element': {
            if (!this.current_ie) {
                beep();
            } else {
                perform_delete_ie_change(this, this.current_ie);
            }
            break;
        }
        case 'settings': {
            SettingsDialog.run();
            break;
        }
        case 'help': {
            open_help_window();
            break;
        }
        case 'activate_menubar': {
            await this.menubar.activate(true);
            break;
        }

        default: {
            const open_recent_match = command.match(/^open_recent_([0-9]{1,3})$/);
            if (open_recent_match) {
                const index = parseInt(open_recent_match[1]);
                const recents = await get_recents();
                if (index >= recents.length) {
                    beep();
                } else {
                    await this.open_notebook_from_file_handle(recents[index].file_handle);
                }
            } else {
                console.warn('** command not handled:', command);
            }
            break;
        }
        }
    }

    async ie_ops_eval_element(ie, stay=false) {
        if (this.get_input_text_for_ie_id(ie.id).trim()) {  // if there is anything to evaluate...
            await this.evaluate_ie(ie, stay);
        }
        // update the modified status of the notebook in case an intermediate result
        // set it to modified but, when done, the notebook was not modified overall
        // from its starting state.
        this.notebook_modified();
    }

    async ie_ops_eval_notebook(ie=undefined, only_before_current_element=false) {
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
        // update the modified status of the notebook in case an intermediate result
        // set it to modified but, when done, the notebook was not modified overall
        // from its starting state.
        this.notebook_modified();
    }

    update_global_view_properties() {
        const is_modified = Change.get_modified_state();
        const is_on_first_element = this.is_on_first_element();
        const is_on_last_element  = this.is_on_last_element();
        this.set_modified_status(is_modified);
        this.menubar.set_menu_enabled_state('save',                 is_modified);
        this.menubar.set_menu_enabled_state('undo',                 Change.can_perform_undo());
        this.menubar.set_menu_enabled_state('redo',                 Change.can_perform_redo());
        this.menubar.set_menu_enabled_state('eval_element',         !!this.current_ie);
        this.menubar.set_menu_enabled_state('eval_stay_element',    !!this.current_ie);
        this.menubar.set_menu_enabled_state('eval_notebook_before', !!this.current_ie);
        this.menubar.set_menu_enabled_state('eval_notebook',        !!this.current_ie);
        this.menubar.set_menu_enabled_state('focus_up_element',     this.current_ie && !is_on_first_element);
        this.menubar.set_menu_enabled_state('move_up_element',      this.current_ie && !is_on_first_element);
        this.menubar.set_menu_enabled_state('focus_down_element',   this.current_ie && !is_on_last_element);
        this.menubar.set_menu_enabled_state('move_down_element',    this.current_ie && !is_on_last_element);
        this.menubar.set_menu_enabled_state('delete_element',       !!this.current_ie);
    }

    set_notebook_unmodified() {
        this._loaded_notebook_hash = this._current_notebook_hash();
        this.set_modified_status(false);
    }
    notebook_modified() {
        // once modified, the notebook stays that way until this.set_notebook_unmodified() is called
        const current_hash = this._current_notebook_hash();
        const modified_state = (current_hash !== this._loaded_notebook_hash);
        this.set_modified_status(modified_state);
        return modified_state;
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
        this.reset_notebook_state();
        await this.set_notebook_source(undefined);
        this.current_ie = undefined;
        const ie = this.add_new_ie();  // add a single new interaction_element
        this.set_current_ie(ie);
        this.focus_to_current_ie();
        Change.update_for_clear(this);
        this.set_notebook_unmodified();

        this.set_running_status(false);
        this.set_formatting_status(false);
        this.update_global_view_properties();
    }

    async _confirm_load() {
        if (this.notebook_modified()) {
            if (! await ConfirmDialog.run('Warning: changes not saved, load new document anyway?')) {
                return false;
            }
        }
        return true;
    }

    async open_notebook_from_file_handle(file_handle, do_import=false, force=false) {
        if (!force && !(await this._confirm_load())) {
            return;
        }

        try {
            const { text, stats } = await fs_interface.open({ file_handle });
            const force_for_finish = true;  // already checked above
            await this.open_notebook_from_text(text, stats, do_import, force_for_finish);
            if (do_import) {
                await this.set_notebook_source(undefined, stats);
            } else {
                await this.set_notebook_source(file_handle, stats);
            }

        } catch (error) {
            console.error('open failed', error.stack);
            await AlertDialog.run(`open failed: ${error.message}\n(initializing empty document)`);
            await this.clear_notebook(true);  // initialize empty notebook
        }
    }

    async open_notebook_from_text(text, stats, do_import=false, force=false) {
        if (!force && !(await this._confirm_load())) {
            return;
        }

        try {
            if (do_import) {
                await this.import_nb_state(text);
            } else {
                const contents = JSON.parse(text);  // may throw an error
                const new_nb_state = this.contents_to_nb_state(contents);
                await this.load_nb_state(new_nb_state);
            }

            Change.update_for_open(this, do_import);

            if (!do_import) {
                this.set_notebook_unmodified();
                // check if this notebook is "autoeval"
                await this._handle_autoeval();
            }

            this.update_global_view_properties();

        } catch (error) {
            console.error('open failed', error.stack);
            await AlertDialog.run(`open failed: ${error.message}\n(initializing empty document)`);
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

            const open_dialog_types = do_import
                  ? [{
                      description: 'JavaScript files (import)',
                      accept: {
                          'text/javascript': ['.js'],
                      },
                  }]
                  : [{
                      description: 'esbook files',
                      accept: {
                          'application/x-esbook': ['.esbook', '.esb'],
                      },
                  }];

            const { canceled, file_handle, text, stats } = await fs_interface.open({
                prompt_options: {
                    types: open_dialog_types,
                },
            });
            if (!canceled) {
                await this.open_notebook_from_text(text, stats, do_import, true);
                if (do_import) {
                    await this.set_notebook_source(undefined, stats);
                } else {
                    await this.set_notebook_source(file_handle, stats);
                }
            }

        } catch (error) {
            console.error('open failed', error.stack);
            await AlertDialog.run(`open failed: ${error.message}\n(initializing empty document)`);
            await this.clear_notebook(true);  // initialize empty notebook
        }
    }

    async save_notebook(interactive=false) {
        let timestamp_mismatch;
        let mismatch_indeterminate;
        try {
            const last_fs_timestamp = this.notebook_file_stats?.last_modified;
            if (!this.notebook_file_handle || typeof last_fs_timestamp !== 'number') {
                timestamp_mismatch = false;  // the file might have been modified, but we cannot determine if so
                mismatch_indeterminate = true;
            } else {
                const stats = await fs_interface.get_fs_stats_for_file_handle(this.notebook_file_handle);
                const current_fs_timestamp = stats.last_modified;
                timestamp_mismatch = (current_fs_timestamp !== last_fs_timestamp);
                mismatch_indeterminate = false;
            }
        } catch (_) {
            timestamp_mismatch = false;
        }

        try {
            if (timestamp_mismatch) {
                const message = `Warning: notebook file ${mismatch_indeterminate ? 'may have been ' : ''}modified by another process, save anyway?`;
                if (! await ConfirmDialog.run(message)) {
                    return;
                }
            }
            if (this.current_ie) {
                this.update_nb_state(this.current_ie);  // make sure recent edits are present in this.nb_state
            }
            const get_text = () => {
                const contents = this.nb_state_to_contents(this.nb_state);
                return JSON.stringify(contents, null, 4);
            };
            const { canceled, file_handle, stats } = await fs_interface.save(get_text, {
                name: this.notebook_file_stats?.name ?? this.constructor.default_save_path,
                file_handle: (interactive || !this.notebook_file_handle) ? undefined : this.notebook_file_handle,
                prompt_options: {
                    types: [{
                        description: 'esbook files',
                        accept: {
                            'application/x-esbook': ['.esbook', '.esb'],
                        },
                    }],
                },
            });
            if (!canceled) {
                await this.set_notebook_source(file_handle, stats);

                this.focus_to_current_ie();

                Change.update_for_save(this);
                this.set_notebook_unmodified();

                this.update_global_view_properties();
            }

        } catch (error) {
//!!! necessary?            await this.set_notebook_source(undefined);  // reset potentially problematic source info
            console.error('save failed', error.stack);
            await AlertDialog.run(`save failed: ${error.message}`);
        }
    }

    async export_notebook() {
        try {
            if (this.current_ie) {
                this.update_nb_state(this.current_ie);  // make sure recent edits are present in this.nb_state
            }

            const get_text = () => {
                const contents = this.nb_state_to_contents(this.nb_state);
                const contents_json = JSON.stringify(contents);
                const default_server_endpoint = new URL('..', current_script_url);
                return create_exported_notebook(contents_json, document.title, default_server_endpoint);
            };

            await fs_interface.save(get_text, {
                name: this.notebook_file_stats?.name ?? this.constructor.default_save_path,
                prompt_options: {
                    types: [{
                        description: 'html files (export)',
                        accept: {
                            'text/html': ['.esbook.html'],
                        },
                    }],
                },
            });

        } catch (error) {
            console.error('export failed', error.stack);
            await AlertDialog.run(`save failed: ${error.message}`);
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
             this.constructor.compatible_nb_version_res.every(re => !new_nb_state.nb_version.match(re)) ||
             !Array.isArray(new_nb_state.order) ||
             typeof new_nb_state.elements !== 'object' ||
             new_nb_state.order.length < 0 ||
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
                 (e.formatting_options && analyze_formatting_options(e.formatting_options)) ||
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
        this.reset_notebook_state();
        // we accepted the notebook format in the validation above, so set current type and version:
        this.nb_state.nb_type    = this.constructor.nb_type;
        this.nb_state.nb_version = this.constructor.nb_version;

        // load the new state
        try {

            // remove current interaction_element elements
            for (const ie of this.interaction_area.querySelectorAll('.interaction_element')) {
                this.interaction_area.removeChild(ie);
            }

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
                nb_data.formatting_options = new_nb_data.formatting_options ?? settings.formatting_options;
            }
            const first_ie = this.interaction_area.querySelector('.interaction_element');
            this.set_current_ie(first_ie ?? undefined);
            if (this.current_ie) {
                // make sure "selected" cursor is correct
                this.set_ie_selection_state(this.current_ie, true);
            }
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
        // check if it is necessary to add initial javascript comment to trigger javascript mode
        const detected_modes = this.constructor.detect_ie_modes(text);
        if (!detected_modes.javascript) {
            text = '//\n' + text;
        }
        // load the text into an empty notebook
        await this.clear_notebook(true);
        // this.current_ie will be set now
        this.set_input_text_for_ie_id(this.current_ie.id, text);
        this.update_nb_state(this.current_ie);  // make sure new text is present in this.nb_state
    }

    async _handle_autoeval() {
        const first_ie_id = this.nb_state.order[0];
        if (first_ie_id) {
            const cm = this.get_internal_state_for_ie_id(first_ie_id).cm;
            const first_line = cm.getLine(0);
            const detected_modes = this.constructor.detect_ie_modes(first_line);
            if (detected_modes.autoeval) {
                await this.ie_ops_eval_notebook();
            }
        }
    }

    focus_to_current_ie() {
        if (this.current_ie) {
            this.set_input_focus_for_ie_id(this.current_ie.id);
        }
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
            mode: 'javascript',  // switch based on buffer format
        });
        this.update_cm_from_settings(cm, ie);
        ie.querySelector('.CodeMirror').classList.add('input');
        const internal_state = this.get_internal_state_for_ie_id(ie.id);
        internal_state.cm = cm;
        const update_ie_mode = () => {  // use arrow function to preserve "this"
            const detected_modes = this.constructor.detect_ie_modes(cm.getLine(0));
            this.set_ie_autohide_state(ie, detected_modes.autohide);
            if (detected_modes.javascript) {
                cm.setOption('mode', 'javascript');
            } else {
                cm.setOption('mode', 'mdmj');
            }
        };
        update_ie_mode();  // update now, will also update during changes
        cm.on('changes', (instance_cm, changes) => {
            add_edit_change(this, ie.id, changes);
            // check for mode update:
            if (changes.some(c => (c.from.line === 0 || c.to.line === 0))) {
                // change affected first line; check if mode changed
                update_ie_mode();
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

    is_on_first_element() {
        if (!this.current_ie) {
            return false;
        } else {
            const order = this.nb_state.order;
            const ie_position = order.indexOf(this.current_ie.id);
            return (ie_position <= 0);
        }
    }
    is_on_last_element() {
        if (!this.current_ie) {
            return false;
        } else {
            const order = this.nb_state.order;
            const ie_position = order.indexOf(this.current_ie.id);
            return (ie_position >= order.length-1);
        }
    }

    // ie may be null or undefined
    set_current_ie(ie, leave_focus_alone=false) {
        if (ie !== this.current_ie) {
            if (this.current_ie) {
                this.update_nb_state(this.current_ie);
                this.set_ie_selection_state(this.current_ie, false);
            }
            this.current_ie = ie;  // ie may be null or undefined
            if (this.current_ie) {
                this.update_nb_state(this.current_ie);
                this.set_ie_selection_state(this.current_ie, true);
            }
        }
        if (!leave_focus_alone) {
            this.focus_to_current_ie();
        }
        this.update_global_view_properties();
    }

    set_ie_selection_state(ie, selected) {
        const cl = ie.classList;
        if (selected) {
            cl.add('selected');
        } else {
            cl.remove('selected');
        }
    }

    set_ie_autohide_state(ie, state) {
        if (state) {
            ie.classList.add(this.constructor._ie_autohide_css_class);
        } else {
            ie.classList.remove(this.constructor._ie_autohide_css_class);
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
        this.set_running_status(true);

        try {
            this.update_nb_state(ie);

            const output_data_collection = this.reset_output(ie);
            const output_context = create_output_context(ie, output_data_collection);

            try {

                const input_text = this.get_input_text_for_ie_id(ie.id);
                const eval_agent = await this.evaluate_input_text(ie.id, output_context, input_text);
                if (eval_agent) {
                    this.set_eval_agent_for_ie_id(ie.id, eval_agent);
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

        } finally {
            this.set_running_status(false);
            this.update_global_view_properties();
        }

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
    // Note: due to the conversion of mdmj to an expression,
    // an EvalAgent instance is always returned.
    async evaluate_input_text(ie_id, output_context, input_text) {
        let text = input_text;
        const detected_modes = this.constructor.detect_ie_modes(input_text);
        if (detected_modes.mdmj) {
            // transform input_text so that, when evaluated, it appears
            // within a tagged template literal string (tag``) where
            // the tag is given by an anonymous tag function.
            // This enables ${} substitutions in the markup.
            // ---------------------------------------------
            // Note: injection attacks are possible!
            // Example: `+alert('hi')+`
            // However, note that you can execute code anyway....
            // Worse issues?
            text = `return ((statics, ...dynamics) => {
                const parts = [];
                for (let i = 0; i < statics.length; i++) {
                    parts.push(statics.raw[i]);
                    if (i < dynamics.length) {
                        parts.push(dynamics[i]);
                    }
                }
                return parts.join('');
            })\`${input_text}\``;
        }
        // note that we are going to evaluate text, even if input_text was mdmj
        // because in that case input_text has been converted to an expression
        // to be evaluated.
        if (text.length > 0) {
            // create formatting() function
            const formatting = ((formatting_options) => {
                this.set_formatting_options_for_ie_id(ie_id, formatting_options);
            }).bind(null);  // don't expose "this"

            // establish initial formatting_options in case it is not set by the evaluation
            formatting(settings.formatting_options);

            const create_worker = () => {
                const eval_worker = new EvalWorker();
                this.internal_nb_state[this.constructor.sym_eval_workers].push(eval_worker);
                return eval_worker;
            };

            // evaluate
            return EvalAgent.eval(this.get_eval_state(), create_worker, formatting, output_context, text);
        }
    }

    async typeset_notebook(single_ie=undefined) {
        try {
            this.set_formatting_status(true);
            const ie_update_list = single_ie ? [single_ie] : this.nb_state.order.map(id => document.getElementById(id));
            if (is_MathJax_v2) {
                for (const ie of ie_update_list) {
                    const formatting_options = this.get_formatting_options_for_ie_id(ie.id);
                    MathJax.Hub.config.displayAlign  = formatting_options.align;   // ok if undefined, will use MathJax default
                    MathJax.Hub.config.displayIndent = formatting_options.indent;  // ok if undefined, will use MathJax default

                    const tasks = [];
                    tasks.push(['Typeset', MathJax.Hub, ie]);
                    tasks.push([this.process_markdown.bind(this), ie]);

                    let set_completed;
                    const done_promise = new Promise(resolve => { set_completed = resolve; });
                    tasks.push(set_completed);

                    MathJax.Hub.Queue(...tasks);
                    await done_promise;
                }
            } else {  // MathJax version 3
                //!!! this needs to be revamped to support ie-by-ie formatting, update displayAlign/displayIndent, etc
                throw new Error('THIS NEEDS TO BE UPDATED FOR MATHJAX V3!!!');
                await MathJax.typesetPromise();
                // process markdown *after* MathJax processing...
                for (const ie of ie_update_list) {
                    this.process_markdown(ie);
                }
            }
        } finally {
            this.set_formatting_status(false);
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
