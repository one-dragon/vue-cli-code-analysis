const path = require('path')
const hash = require('hash-sum')
const { semver, matchesPluginId } = require('./util')

class API {
    constructor(id, service) {
        this.id = id // 插件 id
        this.service = service // Service 类的实例
    }

    // 获取 package.json 的版本号
    get version () {
        return require('../package.json').version
    }

    // 字面翻译：断言版本
    // 等使用到时再记录，猜测可能跟升级发布相关
    assertVersion (range) {
        if (typeof range === 'number') { // 数值时判断是否为整数
            if (!Number.isInteger(range)) {
                throw new Error('Expected string or integer value.')
            }
            range = `^${range}.0.0-0`
        }
        if (typeof range !== 'string') { // 不为 string、integer 报错
            throw new Error('Expected string or integer value.')
        }

        // 判断 this.version 是否符合 range 定义的规则
        if (semver.satisfies(this.version, range, { includePrerelease: true })) return

        throw new Error(
            `Require @vue/cli-service "${range}", but was loaded with "${this.version}".`
        )
    }

    // 获取当前 node 运行命令的目录地址
    getCwd() {
        return this.service.context
    }

    // 解析项目的路径，
    // this.service.context 为当前执行 node 命令所在的文件夹地址
    resolve (_path) {
        return path.resolve(this.service.context, _path)
    }

    /**
     * 检查项目是否具有给定的插件
     *
     * @param {string} id - Plugin id, can omit the (@vue/|vue-|@scope/vue)-cli-plugin- prefix
     * @return {boolean}
    */
    hasPlugin(id) {
        return this.service.plugins.some(p => matchesPluginId(id, p.id))
    }

    /**
     * 注册一个命令，该命令将变为 'vue-cli-service [name]'
     *
     * @param {string} name
     * @param {object} [opts]
     *   {
     *     description: string,
     *     usage: string,
     *     options: { [string]: string }
     *   }
     * @param {function} fn
     *   (args: { [string]: string }, rawArgs: string[]) => ?Promise
    */
    registerCommand (name, opts, fn) {
        if (typeof opts === 'function') {
          fn = opts
          opts = null
        }
        this.service.commands[name] = { fn, opts: opts || {}}
    }

    /**
     * 注册一个可接受链式配置的函数，
     * 该函数是惰性的，在调用 `resolveWebpackConfig` 之前不会被调用
     *
     * @param {function} fn
    */
    chainWebpack (fn) {
        this.service.webpackChainFns.push(fn)
    }

    /**
     * 注册一个可接受原始的 webpack 配置
     * 如果是一个对象，则会通过 webpack-merge 合并到最终的配置中。
     * 如果是一个函数，则会接收被解析的配置作为参数。该函数既可以修改配置并不返回任何东西，也可以返回一个被克隆或合并过的配置版本。
     *
     * @param {object | function} fn
    */
    configureWebpack (fn) {
        this.service.webpackRawConfigFns.push(fn)
    }

    /**
     * 注册一个 devServer 配置函数，在 dev-server 中将接受一个 express 返回的 app 实例
     *
     * @param {function} fn
    */
    configureDevServer(fn) {
        this.service.devServerConfigFns.push(fn)
    }

    /**
     * 解析最终的原始 webpack 配置，该配置将传递到 webpack 中
     *
     * @param {ChainableWebpackConfig} [chainableConfig]
     * @return {object} Raw webpack config.
    */
    resolveWebpackConfig (chainableConfig) {
        return this.service.resolveWebpackConfig(chainableConfig)
    }

    /**
     * 解析 webpack 链式配置实例，
     * 在生成最终的原始 webpack 配置之前，可以进一步调整该实例。
     * 可以多次调用此函数以生成基本 webpack 配置的不同分支。
     * See https://github.com/Yatoo2018/webpack-chain/tree/zh-cmn-Hans
     *
     * @return {ChainableWebpackConfig}
    */
    resolveChainableWebpackConfig() {
        return this.service.resolveChainableWebpackConfig()
    }

    /**
     * 根据多个变量生成缓存标识符
     * id: 'babel-loader' 'eslint-loader' 'vue-loader' 'ts-loader'
     * partialIdentifier: {}
     * configFiles: []
    */
    genCacheConfig(id, partialIdentifier, configFiles = []) {
        const fs = require('fs')
        // 获取缓存目录地址
        // cache-loader 一般设置缓存到 node_modules/.cache/ 下
        const cacheDirectory = this.resolve(`node_modules/.cache/${id}`)

        // 将 \r \n 替换为 \n 生成一致哈希
        const fmtFunc = conf => {
            if (typeof conf === 'function') {
                return conf.toString().replace(/\r\n?/g, '\n')
            }
            return  conf
        }

        const variables = {
            partialIdentifier,
            'cli-service': require('../package.json').version,
            'cache-loader': require('cache-loader/package.json').version,
            env: process.env.NODE_ENV,
            test: !!process.env.VUE_CLI_TEST,
            config: [
                // 获取用户配置的链式配置
                fmtFunc(this.service.projectOptions.chainWebpack),
                // 获取用户配置的原始的 webpack 配置
                fmtFunc(this.service.projectOptions.configureWebpack)
            ]
        }

        // configFiles: 传入一个配置文件列表，后面会尝试获取读取文件内容
        if (!Array.isArray(configFiles)) {
            configFiles = [configFiles]
        }
        configFiles = configFiles.concat([
            'package-lock.json',
            'yarn.lock',
            'pnpm-lock.yaml'
        ])

        // 读取文件内容
        const readConfig = file => {
            const absolutePath = this.resolve(file)
            if (!fs.existsSync(absolutePath)) { // 判断文件是否存在
                return
            }
        
            if (absolutePath.endsWith('.js')) {
                // js 文件时，通过 require 获取内容
                // 应该评估配置脚本以反映环境变量的变化
                try {
                    return JSON.stringify(require(absolutePath))
                } catch (e) {
                    return fs.readFileSync(absolutePath, 'utf-8')
                }
            } else {
                return fs.readFileSync(absolutePath, 'utf-8')
            }
        }

        // 读取配置文件内容并返回内容列表
        variables.configFiles = configFiles.map(file => {
            const content = readConfig(file)
            return content && content.replace(/\r\n?/g, '\n')
        })

        const cacheIdentifier = hash(variables) // 生成 hash 值
        return { cacheDirectory, cacheIdentifier }
    }
}

module.exports = API
