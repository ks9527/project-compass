import {mkdir,copyFile} from 'node:fs/promises';
await mkdir(new URL('../public/vendor/',import.meta.url),{recursive:true});
await copyFile(new URL('../node_modules/marked/lib/marked.esm.js',import.meta.url),new URL('../public/vendor/marked.js',import.meta.url));
await copyFile(new URL('../node_modules/marked/LICENSE',import.meta.url),new URL('../public/vendor/marked-LICENSE.txt',import.meta.url));
