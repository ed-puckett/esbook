'use strict';

(async ({ current_script, facet_export, facet_load_error }) => { try {  // facet begin

    class FsInterface {
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

        /** Save object as JSON to the file asscociated with FileSystemFileHandle
         *  @param {FileSystemFileHandle} file_handle
         *  @param {Object} obj
         *  @return {Promise} resolving to stats: object
         *          where stats is as returned by get_fs_stats_for_file()
         */
        async save_json(file_handle, obj) {
            await this.verify_permission(file_handle, true);
            const writable = await file_handle.createWritable();
            const contents = JSON.stringify(obj, null, 4);
            await writable.write(contents);
            await writable.close();
            const stats = await get_fs_stats_for_file_handle(file_handle);
            return stats;
        }

        /** Load text from the file associated with a FileSystemFileHandle
         *  @param {FileSystemFileHandle} file_handle
         *  @param {boolean} verify_for_writing (Default false) If true, verify write permissions, too
         *  @return {Promise} resolves to { text: string, stats: object }
         *          where stats is as returned by get_fs_stats_for_file()
         */
        async open_text(file_handle, verify_for_writing=false) {
            await this.verify_permission(file_handle, verify_for_writing);
            const file = await file_handle.getFile();
            const text = await file.text();
            const stats = this.get_fs_stats_for_file(file);
            return { text, stats };
        }

        /** Load an object that is encoded in JSON from the file associated with a FileSystemFileHandle
         *  @param {FileSystemFileHandle} file_handle
         *  @param {boolean} verify_for_writing (Default false) If true, verify write permissions, too
         *  @return {Promise} resolves to { contents: object, stats: object }
         *          where stats is as returned by get_fs_stats_for_file()
         */
        async open_json(file_handle, verify_for_writing=false) {
            const { text, stats } = await this.open_text(file_handle, verify_for_writing);
            const contents = JSON.parse(text);
            return { contents, stats };
        }

        /** Return stats for the file associated with a FileSystemFileHandle
         *  @param {FileSystemFileHandle} file_handle
         *  @return {Promise} resolves to stats as returned by get_fs_stats_for_file()
         */
        async get_fs_stats_for_file_handle(file_handle) {
            await this.verify_permission(file_handle);
            const file = await file_handle.getFile();
            return get_fs_stats_for_file(file);
        }

        /** Return stats for the file
         *  @param {File} file
         *  @return {object} stats: {
         *              last_modified: number,  // the "last modified" time of the file in milliseconds since the UNIX epoch (January 1, 1970 at Midnight UTC)
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
        async prompt_for_save(options) {
            const result = await this._prompt(globalThis.showSaveFilePicker, options);
            return result
                ? { file_handle: result }
                : { canceled: true };
        }

        /** Show a file picker for the user to select a file for loading
         *  @param {object|undefined} options for showOpenFilePicker()
         *  @return {Promise} resolves to { canceled: true }|{ file_handle: FileSystemFileHandle }
         */
        async prompt_for_open(options) {
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
                if (err instanceof AbortError) {
                    return undefined;  // indicate: canceled
                } else {
                    throw err;
                }
            }
        }
    }


    // === EXPORT ===

    facet_export(new FsInterface());

} catch (err) { facet_load_error(err, current_script); } })(facet_init());  // facet end
