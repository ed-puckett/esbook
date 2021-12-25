'use strict';

globalThis.core = globalThis.core ?? {};

const { sha224, sha256 } = require('js-sha256');
globalThis.core.sha224 = sha224;
globalThis.core.sha256 = sha256;

const { v4: uuidv4 } = require('uuid');
globalThis.core.uuidv4 = uuidv4;

globalThis.core.generate_object_id = function generate_object_id() {
    // html element ids cannot start with a number
    // (if it does, document.querySelector throws error: '... is not a valid selector')
    return `id-${uuidv4()}`;
};

globalThis.core.generate_uuid = function generate_uuid() {
    return uuidv4();
};
