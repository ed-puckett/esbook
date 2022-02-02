const {
    load_script,
} = await import('./dom-util.js');

const uuid_url = new URL('../node_modules/uuid/dist/umd/uuid.min.js', import.meta.url);
await load_script(document.head, uuid_url);

export const uuidv4 = globalThis.uuid.v4;

export function generate_object_id() {
    // html element ids cannot start with a number
    // (if it does, document.querySelector throws error: '... is not a valid selector')
    return `id-${uuidv4()}`;
}

export function generate_uuid() {
    return uuidv4();
}
