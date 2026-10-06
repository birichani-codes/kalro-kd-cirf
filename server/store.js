const fs = require('fs'), path = require('path');
const DATA_DIR = path.join(__dirname, 'data');
const read = (file) => { const fp = path.join(DATA_DIR, file+'.json'); if (!fs.existsSync(fp)) return []; return JSON.parse(fs.readFileSync(fp,'utf8')); };
const write = (file, data) => { fs.writeFileSync(path.join(DATA_DIR, file+'.json'), JSON.stringify(data,null,2)); };
module.exports = { read, write };
