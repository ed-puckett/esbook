const {
    OpenPromise,
} = await import('./open-promise.js');

const {
    generate_object_id,
} = await import('./uuid.js');

class FsInterface {
    // Determine if the File System Access API is available
    static fsaapi_available = ( globalThis.FileSystemHandle &&
                                globalThis.FileSystemFileHandle &&
                                globalThis.FileSystemDirectoryHandle &&
                                typeof globalThis.showOpenFilePicker  === 'function' &&
                                typeof globalThis.showSaveFilePicker  === 'function' &&
                                typeof globalThis.showDirectoryPicker === 'function'    );

    static ensure_fsaapi_available() {
        if (!this.fsaapi_available) {
            throw new Error('unexpected: File System API is not available');
        }
    }

    get fsaapi_available (){ return this.constructor.fsaapi_available; }

    /** Verify permission to access the given FileSystemHandle, prompting the user if necessary
     *  @param {FileSystemHandle} file_handle
     *  @param {boolean} for_writing
     *  @return {Promise} resolves if permission granted, rejects if permission not granted
     */
    async verify_permission(file_handle, for_writing=false) {
        this.constructor.ensure_fsaapi_available();
        const options = {};
        if (for_writing) {
            options.writable = true;  // File System API legacy
            options.mode = 'readwrite';
        }
        return ( await file_handle.queryPermission(options)   === 'granted' ||
                 await file_handle.requestPermission(options) === 'granted'    );
    }

    /** Save text to the file associated with a FileSystemFileHandle,
     *  with the FileSystemFileHandle possibly gotten from prompting user.
     *  @param {function} get_text nullary function to obtain text to be saved
     *  @param {Object} options: {
     *             file_handle?:    FileSystemFileHandle,  // if given, then open from file_handle without dialog
     *             prompt_options?: Object,                // if given, then options for showSaveFilePicker() dialog
     *         }
     *  @return {Promise} resolves to { canceled: true }|{ file_handle: FileSystemFileHandle, stats: Object }
     *          where stats is as returned by get_fs_stats_for_file()
     */
    async save(get_text, options) {
        if (!this.fsaapi_available) {
            return this.legacy_save(get_text, options);
        }

        options = options ?? {};

        let file_handle = options.file_handle;
        if (!file_handle) {
            const prompt_result = await this.prompt_for_save(options.prompt_options);
            if (prompt_result.canceled) {
                return { canceled: true };
            }
            file_handle = prompt_result.file_handle;
        }

        await this.verify_permission(file_handle, true);
        const text = get_text();
        const writable = await file_handle.createWritable();
        await writable.write(text);
        await writable.close();
        const stats = await this.get_fs_stats_for_file_handle(file_handle);

        return { file_handle, stats };
    }

    /** Load text from the file associated with a FileSystemFileHandle,
     *  with the FileSystemFileHandle possibly gotten from prompting user.
     *  @param {Object} options {
     *             file_handle?:    FileSystemFileHandle,  // if given, then open from file_handle without dialog
     *             prompt_options?: Object,                // if given, then options for showOpenFilePicker() dialog
     *         }
     *  @return {Promise} resolves to { canceled: true }|{ file_handle: FileSystemFileHandle, text: string, stats: Object }
     *          where stats is as returned by get_fs_stats_for_file()
     */
    async open(options) {
        if (!this.fsaapi_available) {
            return this.legacy_open(options);
        }

        options = options ?? {};

        let file_handle = options.file_handle;
        if (!file_handle) {
            const prompt_result = await this.prompt_for_open(options.prompt_options);
            if (prompt_result.canceled) {
                return { canceled: true };
            }
            file_handle = prompt_result.file_handle;
        }

        await this.verify_permission(file_handle, false);
        const file = await file_handle.getFile();
        const text = await file.text();
        const stats = this.get_fs_stats_for_file(file);

        return { file_handle, text, stats };
    }

    /** Return stats for the file associated with a FileSystemFileHandle
     *  @param {FileSystemFileHandle} file_handle
     *  @return {Promise} resolves to stats as returned by get_fs_stats_for_file()
     */
    async get_fs_stats_for_file_handle(file_handle) {
        this.constructor.ensure_fsaapi_available();
        await this.verify_permission(file_handle);
        const file = await file_handle.getFile();
        return this.get_fs_stats_for_file(file);
    }

    /** Return stats for the file
     *  @param {File} file
     *  @return {object} stats: {
     *              lastModified:  number,  // the "last modified" time of the file in milliseconds since the UNIX epoch (January 1, 1970 at Midnight UTC)
     *              last_modified: number,  // synonym for lastModified
     *              name:          string,  // name of file
     *              size:          number,  // size of file in bytes
     *              type:          string,  // MIME type of file contents
     *          }
     */
    get_fs_stats_for_file(file) {
        const {
            lastModified,
            lastModified: last_modified,
            name,
            size,
            type,
        } = file;

        return {
            lastModified,
            last_modified,
            name,
            size,
            type,
        };
    }

    /** Show a file picker for the user to select a file for saving
     *  @param {object|undefined} options for showSaveFilePicker()
     *  @return {Promise} resolves to { canceled: true }|{ file_handle: FileSystemFileHandle }
     */
    async prompt_for_save(options=undefined) {
        this.constructor.ensure_fsaapi_available();
        const result = await this._prompt(globalThis.showSaveFilePicker, options);
        return result
            ? { file_handle: result }
            : { canceled: true };
    }

    /** Show a file picker for the user to select a file for loading
     *  @param {object|undefined} options for showOpenFilePicker()
     *  @return {Promise} resolves to { canceled: true }|{ file_handle: FileSystemFileHandle }
     */
    async prompt_for_open(options=undefined) {
        this.constructor.ensure_fsaapi_available();
        options = options ?? {};
        const result = await this._prompt(globalThis.showOpenFilePicker, { ...options, multiple: false });
        return result
            ? { file_handle: result[0] }
            : { canceled: true };
    }

    async _prompt(picker, options) {
        options = options ?? {};
        let result;
        try {
            return await picker(options);
        } catch (err) {
            // Chromium no longer throws AbortError, instead it throws
            // a DOMException, so just count any exception as "canceled"
            return undefined;  // indicate: canceled
        }
    }

    // === LEGACY ===

    /** Save text to a file chosen by the user with the legacy File API.
     *  @param {function} get_text nullary function to obtain text to be saved
     *  @param {Object} options {
     *             prompt_options?: Object,  // if given, then options for showSaveFilePicker() dialog (will be converted)
     *         }
     *  @return {Promise} resolves to { canceled: true }|{ stats: Object }
     *          where stats is as returned by get_fs_stats_for_file()
     */
    async legacy_save(get_text, options) {
        return new Promise((resolve, reject) => {
            const text = get_text();
            const a_el = document.createElement('a');
            a_el.download = options?.name ?? 'new-notebook.esbook';
            a_el.href = URL.createObjectURL(new Blob([text], { type: 'text/plain'}));
            // document.body.addEventListener('focus', ...) does not get activated, even if capture is set
            document.body.onfocus = (event) => {
                document.body.onfocus = null;
                URL.revokeObjectURL(a_el.href);
                a_el.href = null;
                resolve({});//!!! no stats
            };
            a_el.click();
        });
    }

    /** Load text from the file associated with a FileSystemFileHandle,
     *  with the FileSystemFileHandle possibly gotten from prompting user.
     *  @param {Object} options {
     *             prompt_options?: Object,  // if given, then options for showOpenFilePicker() dialog (will be converted)
     *         }
     *  @return {Promise} resolves to { canceled: true }|{ text: string, stats: Object }
     *          where stats is as returned by get_fs_stats_for_file()
     */
    async legacy_open(options) {
        const accept = this._convert_options_for_legacy(options);

        // For browsers that do not support the File System Access API (e.g., Firefox)
        // opening files is implemented by a file-type input element.  There is a
        // problem with that, though: if the user activates the file open panel and
        // then cancels, no event is emitted that we can use to subsequently remove
        // the input element.
        // Another issue is that the input element will not activate in Firefox (at
        // the time of writing) unless the input element is part of the DOM.
        // Fortunately, the input element need not be displayed in order for it to
        // work.
        // Therefore, once we create the input element, we just leave it in the DOM,
        // hidden, and reuse it whenever necessary.

        let i_el = document.getElementById(this.constructor.legacy_file_input_element_id);
        if (!i_el) {
            i_el = document.createElement('input');
            i_el.id = this.constructor.legacy_file_input_element_id;
            i_el.classList.add('hidden-fs-interface-element');  // css class definition in notebook/notebook.css
            i_el.type = 'file';
            if (accept) {
                i_el.accept = accept;
            }
            document.body.insertBefore(i_el, document.body.firstChild);  // put at beginning of document body
        }

        const op = new OpenPromise();

        i_el.onchange = async (event) => {
console.log('COMPLETE');//!!!
            if (i_el.files.length <= 0) {
                op.resolve({ canceled: true });
            } else {
                const file = i_el.files[0];
                const text  = await file.text();
                const stats = this.get_fs_stats_for_file(file);
                op.resolve({
                    text,
                    stats,
                });
            }
        }

        // activate the file open panel
        i_el.click();

        return op.promise;
    }

    static legacy_file_input_element_id = 'legacy_file_input_element_id';

    _convert_options_for_legacy(options) {
        options = options ?? {};
        const options_accept = options?.prompt_options?.types?.[0]?.accept;
        const accept = !options_accept ? undefined : Object.keys(options_accept);
        return accept;
    }
}

export const fs_interface = new FsInterface();
