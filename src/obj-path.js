export function get_obj_path(obj, path) {
    for (const segment of path) {
        obj = (obj ?? {})[segment];
    }
    return obj;
}

export function set_obj_path(obj, path, value) {
    if (path.length < 1) {
        throw new Error('path must contain at least one segment');
    }
    for (const segment of path.slice(0, -1)) {
        if (typeof obj[segment] === 'undefined') {
            obj[segment] = {};
        }
        obj = obj[segment];
    }
    obj[path.slice(-1)[0]] = value;
}
