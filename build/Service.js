
const fs = require('fs')
const path = require('path')
const merge = require('webpack-merge')
const Config = require('webpack-chain')
const API = require('./API')
const dotenv = require('dotenv')
const dotenvExpand = require('dotenv-expand') // 加载 .env 文件，并设置文件变量到 process.env 中
const defaultsDeep = require('lodash.defaultsdeep')
const { chalk, warn, error, isPlugin, resolvePluginId, resolvePkg, loadModule } = require('./util')

const { defaultsOptions } = require('./options')

module.exports = class Service {
    constructor(context, { plugins, pkg, inlineOptions, useBuiltIn } = {}) {
        process.VUE_CLI_SERVICE = this
        
        this.initialized = false // 是否已初始化
        
        // 当前执行 node 命令所在的文件夹地址，
        // 一般在项目根目录下
        this.context = context
        
        this.inlineOptions = inlineOptions // 初始化传入 '内联配置'

        this.webpackChainFns = [] // 链式配置函数列表 [ fn, ... ]
        this.webpackRawConfigFns = [] // 原始的 webpack 配置列表 [ fn, obj, ... ]
        this.devServerConfigFns = []
        
        this.commands = {} // 运行命令集合，{ serve: { fn, opts}, ... }

        // 包含目标插件的 package.json 的文件夹地址，
        // 默认为 this.context 项目根目录下
        this.pkgContext = context
        // 包含插件的 package.json
        this.pkg = this.resolvePkg(pkg)

        // 如果有内联插件，则将使用它们，而不是 package.json 中的插件。
        // 当 useBuiltIn === false 时，将禁用内置插件。这主要是为了测试。
        // [ { id: 'built-in:commands/serve', apply: fn }, ... ]
        this.plugins = this.resolvePlugins(plugins, useBuiltIn)
        // pluginsToSkip 将在运行 run() 期间填充
        // 调用插件(this.plugins)时判断是否跳过
        this.pluginsToSkip = new Set()
        // console.log(this.plugins)

        /*  获取不同的环境模式，如：
            { 
                serve: 'development',
                build: 'production',
                inspect: 'development',
                'test:unit': 'test' 
            }
        */
        this.modes = this.plugins.reduce((modes, { apply: { defaultModes }}) => {
            return Object.assign(modes, defaultModes)
        }, {})
    }

    // 解析 package.json 返回一个对象
    // 可设置 vuePlugins.resolveFrom 选项指向包含其它 package.json 的文件夹。
    // 例如，如果有一个 .config/package.json 文件："vuePlugins": { "resolveFrom": ".config" }
    resolvePkg (inlinePkg, context = this.context) {
        if (inlinePkg) {
            return inlinePkg
        }
        const pkg = resolvePkg(context)
        if (pkg.vuePlugins && pkg.vuePlugins.resolveFrom) {
            this.pkgContext = path.resolve(context, pkg.vuePlugins.resolveFrom)
            return this.resolvePkg(null, this.pkgContext)
        }
        return pkg
    }

    // 加载 env 变量文件、加载合并用户配置选项、调用插件（调用 this.plugins）
    init(mode) {
        if (this.initialized) {
            return
        }
        this.initialized = true

        this.mode = mode

        // load mode .env，加载 env 环境模式变量文件
        if (mode) {
            this.loadEnv(mode)
        }
        // load base .env，加载 env 基础的变量文件
        this.loadEnv()

        // load user config，加载、合并用户配置选项
        const userOptions = this.loadUserOptions()
        this.projectOptions = defaultsDeep(userOptions, defaultsOptions())

        // debug('vue:project-config')(this.projectOptions)

        // apply plugins，调用插件（调用 this.plugins）
        this.plugins.forEach(({ id, apply }) => {
            if (this.pluginsToSkip.has(id)) return
            apply(new API(id, this), this.projectOptions)
        })

        // 从用户配置选项中应用 webpack 链式配置
        if (this.projectOptions.chainWebpack) {
            this.webpackChainFns.push(this.projectOptions.chainWebpack)
        }

        // 从用户配置选项中应用原始的 webpack 配置
        if (this.projectOptions.configureWebpack) {
            this.webpackRawConfigFns.push(this.projectOptions.configureWebpack)
        }
    }

    // 加载 .env .env.${mode} 文件，赋值到 process.env
    // 判断并设置 process.env.NODE_ENV 环境变量
    loadEnv(mode) {
        // const logger = debug('vue:env')
        /*
            .env               # 在所有的环境中被载入
            .env.local         # 在所有的环境中被载入，但会被 git 忽略
            .env.[mode]        # 只在指定的模式中被载入
            .env.[mode].local  # 只在指定的模式中被载入，但会被 git 忽略
        */
        // 获取 .env、.env.${mode} 文件路径
        const basePath = path.resolve(this.context, `.env${mode ? `.${mode}` : ``}`)
        // 获取 .env.local、.env.${mode}.local 文件路径
        const localPath = `${basePath}.local`

        const load = envPath => {
            try {
                const env = dotenv.config({ path: envPath, debug: process.env.DEBUG })
                dotenvExpand(env)
                // logger(envPath, env)
            } catch (err) {
                // ENOENT 错误表示找不到文件或目录，遇到错误时忽略报错
                // only ignore error if file is not found
                if (err.toString().indexOf('ENOENT') < 0) {
                    error(err)
                }
            }
        }

        load(localPath) // 解析 .env、.env.${mode} 文件到 process.env 中
        load(basePath) // 解析 .env.local、.env.${mode}.local 文件到 process.env 中

        // 默认情况下，NODE_ENV 和 BABEL_ENV 设置为 'development'，
        // 除非 mode 是 production 或 test。
        // 但是 .env 文件中的如果设置了 NODE_ENV 将具有更高的优先级。
        if (mode) { // 设置 NODE_ENV、BABEL_ENV
            // 在 test 中需要始终设置 NODE_ENV，为了在测试中不会互相受影响
            const shouldForceDefaultEnv = (
                process.env.VUE_CLI_TEST &&
                !process.env.VUE_CLI_TEST_TESTING_ENV
            )
            // 不为 'production' 或 'test' 时，默认设置为 'development'
            const defaultNodeEnv = (mode === 'production' || mode === 'test')
                ? mode
                : 'development'
            // 在测试中 或者 .env 文件中没设置 NODE_ENV 时，
            // 使用 defaultNodeEnv
            if (shouldForceDefaultEnv || process.env.NODE_ENV == null) {
                process.env.NODE_ENV = defaultNodeEnv
            }
            if (shouldForceDefaultEnv || process.env.BABEL_ENV == null) {
                process.env.BABEL_ENV = defaultNodeEnv
            }
        }
    }

    // 以逗号分隔的插件名称列表，设置跳过插件运行 id，
    // 到 this.pluginsToSkip 中
    setPluginsToSkip (args) {
        const skipPlugins = args['skip-plugins']
        const pluginsToSkip = skipPlugins
            ? new Set(skipPlugins.split(',').map(id => resolvePluginId(id)))
            : new Set()
    
        this.pluginsToSkip = pluginsToSkip
    }

    // 初始化调用，解析内置插件到 this.plugins
    // 当 useBuiltIn === false 时，将禁用内置插件。这主要是为了测试。
    resolvePlugins(inlinePlugins, useBuiltIn) {
        const idToPlugin = id => ({
            id: id.replace(/^.\//, 'built-in:'),
            apply: require(id)
        })
        
        let plugins
        
        const builtInPlugins = [
            './commands/serve',
            // './commands/build',
            // './commands/inspect',
            './commands/help',
            // config plugins are order sensitive
            './config/base',
            // './config/css',
            // './config/prod',
            // './config/app'
        ].map(idToPlugin)

        // 当有内联插件时，
        // useBuiltIn 不为 false 时，合并到内置插件中
        // useBuiltIn 为 false 时，只使用内联插件
        if (inlinePlugins) {
            plugins = useBuiltIn !== false
                ? builtInPlugins.concat(inlinePlugins)
                : inlinePlugins
        } else {
            // 加载 package.json 中定义的 npm插件
            const projectPlugins = Object.keys(this.pkg.devDependencies || {})
                .concat(Object.keys(this.pkg.dependencies || {}))
                .filter(isPlugin)
                .map(id => {
                    if (
                        this.pkg.optionalDependencies &&
                        id in this.pkg.optionalDependencies
                    ) {
                        let apply = () => {}
                        try {
                            apply = require(id)
                        } catch (e) {
                            warn(`Optional dependency ${id} is not installed.`)
                        }

                        return { id, apply }
                    } else {
                        return idToPlugin(id)
                    }
                })
            plugins = builtInPlugins.concat(projectPlugins)
        }

        // 加载本地自定义插件
        if (this.pkg.vuePlugins && this.pkg.vuePlugins.service) {
            const files = this.pkg.vuePlugins.service
            if (!Array.isArray(files)) {
                throw new Error(`Invalid type for option 'vuePlugins.service', expected 'array' but got ${typeof files}.`)
            }
            plugins = plugins.concat(files.map(file => ({
                id: `local:${file}`,
                apply: loadModule(`./${file}`, this.pkgContext)
            })))
        }

        return plugins
    }

    /**
     * 初始化并运行对应环境命令
     * @param {*} name 
     * @param {*} args 
     * {
            _: [ 'serve' ],
            modern: false,
            report: false,
            'report-json': false,
            'inline-vue': false,
            watch: false,
            open: true,
            copy: false,
            https: false,
            verbose: false 
        }
     * @param {*} rawArgv 
     */
    async run(name, args = {}, rawArgv = []) {
        // console.log('name:', name)
        // console.log('args:', args)
        // console.log('rawArgv:', rawArgv)

        // 获取环境模式（即使 args.mode 为 true，在 loadEnv 中也会判断设置正确的环境模式）
        // 先尝试从命令行参数解析中获取 --mode
        // 其次如果定义了 --watch 则设置默认环境模式
        // 否则通过 this.modes 获取
        const mode = args.mode || (name === 'build' && args.watch ? 'development' : this.modes[name])

        // 在 args['skip-plugins'] 中可能具有在 init() 期间应跳过的插件设置
        this.setPluginsToSkip(args)

        // init：加载 env 变量文件、加载用户配置选项、调用插件（调用 this.plugins）
        this.init(mode)

        args._ = args._ || []
        // 获取启动的服务命令，serve、build、inspect
        // vue-cli-service serve [options] [entry]
        let command = this.commands[name]
        if (!command && name) { // 获取不到报错
            console.error(`command "${name}" does not exist.`)
            process.exit(1)
        }
        if (!command || args.help || args.h) { // 如果有 --help，加载 help 命令，输出对当前服务命令的帮助提示信息
            command = this.commands.help
        } else { // 如果没有，删除 args._ 中第一个内容，因为可以设置指定 [entry]
            args._.shift() // remove command itself
            rawArgv.shift()
        }
        const { fn } = command
        return fn(args, rawArgv) // 调用对应的服务命令回调函数
    }

    // 解析链式配置并返回
    resolveChainableWebpackConfig () {
        const chainableConfig = new Config()
        // apply chains
        this.webpackChainFns.forEach(fn => fn(chainableConfig))
        return chainableConfig
    }

    // 解析原始的 webpack 配置并返回
    // 同时解析用户设置的 options.configureWebpack 选项内容
    resolveWebpackConfig (chainableConfig = this.resolveChainableWebpackConfig()) {
        if (!this.initialized) { // 初始化时为 false，init 后为 true
            throw new Error('Service must call init() before calling resolveWebpackConfig().')
        }
        
        // 获取原始配置
        let config = chainableConfig.toConfig()
        const original = config
        // 应用原始配置函数列表(init() 时判断 configureWebpack 配置并插入 webpackRawConfigFns列表)
        this.webpackRawConfigFns.forEach(fn => {
            if (typeof fn === 'function') {
                // 具有可选返回值的函数
                const res = fn(config)
                 // 函数有返回值时，合并到当前配置中
                if (res) config = merge(config, res)
            } else if (fn) {
                // 合并对象到当前配置中
                config = merge(config, fn)
            }
        })

        // #2206
        // 如果 config 配置被 merge-webpack 合并，
        // 它将丢弃 webpack-chain 注入的 __ruleNames 信息。
        // 恢复信息，以便 vue inspect 正常工作
        if (config !== original) {
            cloneRuleNames(
                config.module && config.module.rules,
                original.module && original.module.rules
            )
        }

        // 检查用户是否手动更改了output.publicPath
        // build 时会设置此值，其他环境不会设置此值
        const target = process.env.VUE_CLI_BUILD_TARGET
        if (
            !process.env.VUE_CLI_TEST &&
            (target && target !== 'app') &&
            config.output.publicPath !== this.projectOptions.publicPath
        ) {
            throw new Error(
                `Do not modify webpack output.publicPath directly. ` +
                `Use the "publicPath" option in vue.config.js instead.`
            )
        }

        // 判断入口文件，并设置到 process.env.VUE_CLI_ENTRY_FILES
        // 供 babel-preset-app 插件使用
        if (typeof config.entry !== 'function') {
            let entryFiles
            if (typeof config.entry === 'string') {
                entryFiles = [config.entry]
            } else if (Array.isArray(config.entry)) {
                entryFiles = config.entry
            } else {
                entryFiles = Object.values(config.entry || []).reduce((allEntries, curr) => {
                    return allEntries.concat(curr)
                }, [])
            }
      
            entryFiles = entryFiles.map(file => path.resolve(this.context, file))
            process.env.VUE_CLI_ENTRY_FILES = JSON.stringify(entryFiles)
        }

        return config
    }

    // 加载用户配置
    loadUserOptions () {
        // config.js
        let fileConfig, pkgConfig, resolved, resolvedFrom
        // 加载本地自定义配置文件
        const configPath = (
            process.env.VUE_CLI_SERVICE_CONFIG_PATH || // 测试时可设置全局变量
            path.resolve(this.context, 'config.js')
        )
        // let fileConfig = {}
        // const configPath = path.resolve(this.context, 'config.js')
        // 判断配置文件返回内容
        if(fs.existsSync(configPath)) {
            try {
                fileConfig = require(configPath)

                if(typeof fileConfig === 'function') {
                    fileConfig = fileConfig()
                }

                if(!fileConfig || typeof fileConfig !== 'object') {
                    error(
                        `Error loading ${chalk.bold('config.js')}: should export an object or a function that returns object.`
                    )
                    fileConfig = null
                }
            } catch (error) {
                error(`Error loading ${chalk.bold('config.js')}:`)
                throw e
            }
        }

        // 判断 package.vue 是否配置内容
        pkgConfig = this.pkg.vue
        if (pkgConfig && typeof pkgConfig !== 'object') {
            error(
                `Error loading vue-cli config in ${chalk.bold(`package.json`)}: ` +
                `the "vue" field should be an object.`
            )
            pkgConfig = null
        }

        // 本地配置了 config.js
        if (fileConfig) {
            // 如果本地配置了 config.js 并 package.vue 也配置内容就报警告
            if (pkgConfig) {
                warn(
                    `"vue" field in package.json ignored ` +
                    `due to presence of ${chalk.bold('vue.config.js')}.`
                )
                warn(
                    `You should migrate it into ${chalk.bold('vue.config.js')} ` +
                    `and remove it from package.json.`
                )
            }
            resolved = fileConfig
            resolvedFrom = 'vue.config.js'
        } else if (pkgConfig) { // package.vue 配置内容
            resolved = pkgConfig
            resolvedFrom = '"vue" field in package.json'
        } else { // 初始化传入'内联配置'
            resolved = this.inlineOptions || {}
            resolvedFrom = 'inline options'
        }

        // 不支持 css.modules 改用 css.requireModuleExtension
        // 判断报警告并赋值给 css.requireModuleExtension
        // if (resolved.css && typeof resolved.css.modules !== 'undefined') {
        //     if (typeof resolved.css.requireModuleExtension !== 'undefined') {
        //         warn(
        //             `You have set both "css.modules" and "css.requireModuleExtension" in ${chalk.bold('vue.config.js')}, ` +
        //             `"css.modules" will be ignored in favor of "css.requireModuleExtension".`
        //         )
        //     } else {
        //         warn(
        //             `"css.modules" option in ${chalk.bold('vue.config.js')} ` +
        //             `is deprecated now, please use "css.requireModuleExtension" instead.`
        //         )
        //         resolved.css.requireModuleExtension = !resolved.css.modules
        //     }
        // }

        // normalize some options
        ensureSlash(resolved, 'publicPath') // 判断地址后缀是否加 '/'
        if (typeof resolved.publicPath === 'string') {
            resolved.publicPath = resolved.publicPath.replace(/^\.\//, '')
        }
        removeSlash(resolved, 'outputDir') // 判断是否删除后缀 '/'

        return resolved
    }
}

// 判断地址后缀是否加 '/'
function ensureSlash (config, key) {
    const val = config[key]
    if (typeof val === 'string') {
        config[key] = val.replace(/([^/])$/, '$1/')
    }
}

// 判断是否删除后缀 '/
function removeSlash (config, key) {
    if (typeof config[key] === 'string') {
        config[key] = config[key].replace(/\/$/g, '')
    }
}

// to: config.module.rules, from: original.module.rules
function cloneRuleNames (to, from) {
    if (!to || !from) {
        return
    }
    from.forEach((r, i) => {
        if (to[i]) {
            Object.defineProperty(to[i], '__ruleNames', {
                value: r.__ruleNames
            })
            cloneRuleNames(to[i].oneOf, r.oneOf)
        }
    })
}