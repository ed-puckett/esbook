const { IndexedDBInterface } = await import('../idb.js');

// db_key_settings uses a UUID, but this must be constant,
// not generated each time the system is loaded.
export const db_key_settings = 'settings-87a4c2ee-a607-45f9-b648-935ecfc0c059';

// db_key_recents uses a UUID, but this must be constant,
// not generated each time the system is loaded.
export const db_key_recents = 'recents-47376308-631f-11ec-a634-2ff0aa4e84db';

export const storage_db = new IndexedDBInterface();
