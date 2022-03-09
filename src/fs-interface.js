class FsInterface {
    // Determine if the File System Access API is available
    static fsaapi_available = ( globalThis.FileSystemHandle &&
                                globalThis.FileSystemFileHandle &&
                                globalThis.FileSystemDirectoryHandle &&
                                typeof globalThis.showOpenFilePicker  === 'function' &&
                                typeof globalThis.showSaveFilePicker  === 'function' &&
                                typeof globalThis.showDirectoryPicker === 'function'    );

    get fsaapi_available (){ return this.constructor.fsaapi_available; }

    /** Verify permission to access the given FileSystemHandle, prompting the user if necessary
     *  @param {FileSystemHandle} file_handle
     *  @param {boolean} for_writing
     *  @return {Promise} resolves if permission granted, rejects if permission not granted
     */
    async verify_permission(file_handle, for_writing=false) {
        const options = {};
        if (for_writing) {
            options.writable = true;  // legacy
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
}

export const fs_interface = new FsInterface();
