
[
    'logger',
    'pkg',
    'pluginResolution',
    'module'
].forEach(m => {
    Object.assign(exports, require(`./${m}`))
})

exports.chalk = require('chalk') // 定义输出样式文本
exports.semver = require('semver') // npm 的语义版本控制工具
