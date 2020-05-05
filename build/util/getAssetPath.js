const path = require('path')

// 放置生成的静态资源 (js、css、img、fonts) 的 (相对于 outputDir 的) 目录。
module.exports = function getAssetPath (options, filePath) {
    return options.assetsDir
        ? path.posix.join(options.assetsDir, filePath)
        : filePath
}
