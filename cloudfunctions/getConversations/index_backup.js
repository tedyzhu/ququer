// 备份原始的复杂版本
const fs = require('fs');
const originalContent = fs.readFileSync('./index.js', 'utf8');
fs.writeFileSync('./index_original.js', originalContent);
