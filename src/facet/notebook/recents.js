'use strict';

(async ({ current_script, facet, facet_export, facet_load_error }) => { try {  // facet begin

    const {
        db_key_recents,
        storage_db,
    } = await facet('facet/notebook/storage.js');


    // === STORAGE ===

    function is_valid_recent(recent) {
        return (recent instanceof FileSystemFileHandle);
    }

    // may throw an error
    async function get_recents() {
        let recents = await storage_db.get(db_key_recents);
        if (Array.isArray(recents) && recents.every(is_valid_recent)) {
            return recents;
        } else {
            const reinitialized_recents = [];
            await storage_db.put(db_key_recents, reinitialized_recents);
            return reinitialized_recents;
        }
    }

    // may throw an error
    async function add_to_recents(recent) {
        if (!is_valid_recent(recent)) {
            throw new Error('recent must be a FileSystemFileHandle object');
        }
        const recents = await get_recents();
        const new_recents = [ recent, ...recents.filter(r => r.isSameEntry(recent)) ];
        return storage_db.put(db_key_recents, new_recents);
    }

    // may throw an error
    async function clear_recents(file_handle) {
        return storage_db.put(db_key_recents, []);
    }


    // === EXPORT ===

    facet_export({
        get_recents,
        add_to_recents,
        clear_recents,
    });

} catch (err) { facet_load_error(err, current_script); } })(globalThis.core.facet_init());  // facet end
