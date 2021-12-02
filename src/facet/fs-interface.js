'use strict';

// This is a facet

(() => { try {

    class FsInterface {
        constructor() {
        }

        // async (path: string, obj: object, create_mode:boolean=false) => { selected_path: string, fs_timestamp: number }
        // may throw an error
        async save_json(path, obj, create_mode=false) {
            const selected_path = fs_path.resolve(path);
            const contents = JSON.stringify(obj, null, 4);
            await fs_promises.writeFile(selected_path, contents);
            const fs_timestamp = await this.get_fs_timestamp(selected_path);
            return { selected_path, fs_timestamp };
        }

        // async (path: string, false) => { selected_path: string, contents: object, fs_timestamp: number }  // JSON
        // async (path: string, true)  => { contents: string, fs_timestamp: number }  // file contents as UTF-8
        // may throw an error
        async load_file(path, load_raw) {
            const selected_path = fs_path.resolve(path);
            const fs_timestamp = await this.get_fs_timestamp(selected_path);
            const contents = await fs_promises.readFile(selected_path, { encoding: 'utf8' });
            if (load_raw) {
                return { contents, fs_timestamp };
            } else {
                const obj = JSON.parse(contents);
                return { selected_path, contents: obj, fs_timestamp };
            }
        }

        // async (path: string) => number
        // may throw an error
        async get_fs_timestamp(path) {
            const stat = await fs_promises.stat(path);
            return stat.mtimeMs;
        }
    }


    // === EXPORT ===

    facet_export(new FsInterface());

} catch (err) { facet_load_error(err); }})();
