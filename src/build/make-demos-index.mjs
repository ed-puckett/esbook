#!/usr/bin/env node

import { readFileSync } from 'fs';

import { writeFile } from 'fs/promises';

const html_files = readFileSync(0).toString().split(/\r?\n/)
    .map(s => s.trim().replace(/^[.][/]/, ''))
    .filter(s => s !== '');

const demos_dir = new URL('../../demos/', import.meta.url);
const dest      = new URL('index.html', demos_dir);

const contents_html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Esbook Demos</title>
</head>
<body>
<h1>Esbook Demos</h1>
<ul>
${ html_files.map(file => `<li><a target="_blank" href="./${file}">${file}</a></li>`).join('\n') }
</ul>
</body>
</html>
`;

await writeFile(dest, contents_html);

process.exit(0);
