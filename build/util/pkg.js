const fs = require('fs')
const path = require('path')
const readPkg = require('read-pkg') // 读取 package.json 文件

// 解析 package.json 文件内容
exports.resolvePkg = function (context) {
    if (fs.existsSync(path.join(context, 'package.json'))) {
        return readPkg.sync({ cwd: context })
    }
    return {}
}
