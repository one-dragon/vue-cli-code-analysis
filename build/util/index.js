
[
    'logger',
    'pkg',
    'pluginResolution',
    'module'
].forEach(m => {
    Object.assign(exports, require(`./${m}`))
})

exports.chalk = require('chalk')