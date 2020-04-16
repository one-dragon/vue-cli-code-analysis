const path = require('path')

class API {
    constructor(id, service) {
        this.id = id
        this.service = service
    }

    // 解析项目的路径，this.service.context 为当前执行 node 命令所在的文件夹地址
    resolve (_path) {
        return path.resolve(this.service.context, _path)
    }

    // 注册一个命令，该命令将变为 'vue-cli-service [name]'
    registerCommand (name, opts, fn) {
        if (typeof opts === 'function') {
          fn = opts
          opts = null
        }
        this.service.commands[name] = { fn, opts: opts || {}}
    }

    // 注册一个可接受链式配置的函数，
    // 该函数是惰性的，在调用 `resolveWebpackConfig` 之前不会被调用
    // @param {function} fn
    chainWebpack (fn) {
        this.service.webpackChainFns.push(fn)
    }

    // 注册一个可接受原始的 webpack 配置
    // 如果是一个对象，则会通过 webpack-merge 合并到最终的配置中。
    // 如果是一个函数，则会接收被解析的配置作为参数。该函数既可以修改配置并不返回任何东西，也可以返回一个被克隆或合并过的配置版本。
    // @param {object | function} fn
    configureWebpack (fn) {
        this.service.webpackRawConfigFns.push(fn)
    }

    // 解析最终的原始 webpack 配置，该配置将传递到 webpack 中
    resolveWebpackConfig (chainableConfig) {
        return this.service.resolveWebpackConfig(chainableConfig)
    }
}

module.exports = API