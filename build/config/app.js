
// 特定于 --target app 的配置

const fs = require('fs')
const path = require('path')

// 确保传递给 html-webpack-plugin 的文件名(filename)是相对路径，因为它不能正确处理绝对路径
function ensureRelative (outputDir, _path) {
    if (path.isAbsolute(_path)) {
        return path.relative(outputDir, _path)
    } else {
        return _path
    }
}

module.exports = (api, options) => {
    // 仅在没有其他目标时适用
}