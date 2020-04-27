
const path = require('path')

// 返回本地的文件夹地址(即当前项目下的文件夹地址)，如 'node_modules'
module.exports = function resolveLocal (...args) {
    return path.join(__dirname, '../../', ...args)
}
