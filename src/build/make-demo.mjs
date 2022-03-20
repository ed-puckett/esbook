#!/usr/bin/env node

const default_server_endpoint = 'https://blackguard.github.io/esbook/build/';

const source_extension = '.esbook';
const dest_extension   = '.html';


const {
    create_exported_notebook,
} = await import('../notebook/create-exported-notebook.mjs');

import { readFile, writeFile } from 'fs/promises';


const progname = process.argv[1]?.split('/').slice(-1)[0];

function usage_error(message) {
    console.error('Usage:', progname, '{source_file}');
    console.error('- {source_file} must exist in the examples directory');
    console.error(`- {source_file} must must end with "${source_extension}"`);
    if (message) {
        console.error('**', message);
    }
    process.exit(1);
}


if (!progname || process.argv.length !== 3) {
    usage_error();
}

const source_file = process.argv[2];

if (!source_file.endsWith(source_extension)) {
    usage_error();
}

const examples_dir = new URL('../../examples/', import.meta.url);
const demos_dir    = new URL('../../demos/', import.meta.url);
const source       = new URL(source_file, examples_dir);
const dest_file    = source_file.substring(0, source_file.length-source_extension.length) + dest_extension;
const dest         = new URL(dest_file, demos_dir);

const contents_json_from_file = await readFile(source, {
    encoding: 'utf8',
});

const contents_json = JSON.stringify(JSON.parse(contents_json_from_file));  // re-encode with no indentation

const document_title = source_file.split('/').slice(-1)[0];  // remove parent directories from source_file
const contents_html = create_exported_notebook(contents_json, document_title, default_server_endpoint);
await writeFile(dest, contents_html);
