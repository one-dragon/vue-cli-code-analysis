const { info, chalk } = require('../util')

const devDefault = {
    host: '0.0.0.0',
    port: 8080,
    https: false
}

module.exports = (api, options) => {
    // console.log('options====')
    // console.log(options)
    api.registerCommand('serve', {
        description: 'start development server',
        usage: 'vue-cli-service serve [options] [entry]',
        options: {
            '--open': `open browser on server start`,
            '--copy': `copy url to clipboard on server start`,
            '--stdin': `close when stdin ends`,
            '--mode': `specify env mode (default: development)`,
            '--host': `specify host (default: ${defaults.host})`,
            '--port': `specify port (default: ${defaults.port})`,
            '--https': `use https (default: ${defaults.https})`,
            '--public': `specify the public network URL for the HMR client`,
            '--skip-plugins': `comma-separated list of plugin names to skip for this run`
        }
    }, async function serve (args) {
        info('Starting development server...')
        // console.log('args=======')
        // console.log(args)

        // console.log('process.env.NODE_ENV===========')
        // console.log(process.env.NODE_ENV)

        // 即使这是一个 dev server，但可能是以生产环境的模式运行它，例如在E2E测试中。
        const isInContainer = checkInContainer()
        const isProduction = process.env.NODE_ENV === 'production'

        const url = require('url')
        const webpack = require('webpack')
        const WebpackDevServer = require('webpack-dev-server')
        const portfinder = require('portfinder') // 自动获取端口
        const prepareURLs = require('../util/prepareURLs')
        const prepareProxy = require('../util/prepareProxy')
        // const launchEditorMiddleware = require('launch-editor-middleware')
        const validateWebpackConfig = require('../util/validateWebpackConfig')
        const isAbsoluteUrl = require('../util/isAbsoluteUrl')

        // configs that only matters for dev server
        // 配置仅对 dev server
        api.chainWebpack(webpackConfig => {
            if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
                webpackConfig
                    .devtool('cheap-module-eval-source-map')
        
                webpackConfig
                    .plugin('hmr')
                    .use(require('webpack/lib/HotModuleReplacementPlugin'))
        
                // https://github.com/webpack/webpack/issues/6642
                // https://github.com/vuejs/vue-cli/issues/3539
                webpackConfig
                    .output
                    .globalObject(`(typeof self !== 'undefined' ? self : this)`)
                    
                    
                webpackConfig
                    .plugin('progress')
                    .use(require('webpack/lib/ProgressPlugin'))
                // if (!process.env.VUE_CLI_TEST && options.devServer.progress !== false) {
                //     webpackConfig
                //     .plugin('progress')
                //     .use(require('webpack/lib/ProgressPlugin'))
                // }
            }
        })

        // 解析 webpack config 配置
        const webpackConfig = api.resolveWebpackConfig()

        // check for common config errors，检查公共配置是否有错
        validateWebpackConfig(webpackConfig, api, options)

        // 加载用户配置的 devServer 选项的优先级高于 webpack 中配置的 devServer 选项
        const projectDevServerOptions = Object.assign(
            webpackConfig.devServer || {},
            options.devServer
        )

        // expose advanced stats
        // if (args.dashboard) {
        //     const DashboardPlugin = require('../webpack/DashboardPlugin')
        //     ;(webpackConfig.plugins = webpackConfig.plugins || []).push(new DashboardPlugin({
        //     type: 'serve'
        //     }))
        // }

        // https://cli.vuejs.org/zh/guide/cli-service.html#vue-cli-service-serve
        // node ./build/bin/index.js serve [options] [entry]
        // 判断指定为唯一入口 [entry]
        // 在 Service.js 中的 run 函数里删除了 args._[0] 指定的 'serve' 剩下 [entry] 配置
        const entry = args._[0]
        if(entry) {
            webpackConfig.entry = {
                app: api.resolve(entry)
            }
        }

        // 解析 devServer 选项
        const useHttps = args.https // 判断是否使用 https
            || projectDevServerOptions.https 
            || devDefault.https
        const protocol = useHttps ? 'https' : 'http' // 定义协议
        const host = args.host // 定义IP地址
            || process.env.HOST 
            || projectDevServerOptions.host
            || devDefault.host
            || process.env.HOST 
        portfinder.basePort = args.port // 定义自动获取端口插件的基础端口号，会已基础端口或向上查找可用端口
            || process.env.PORT 
            || projectDevServerOptions.port 
            || devDefault.port
        const port = await portfinder.getPortPromise() // 定义并获取可用端口号
        // 解析 devServer.public 选项
        // https://www.webpackjs.com/configuration/dev-server/#devserver-public
        const rawPublicUrl = args.public || projectDevServerOptions.public
        const publicUrl = rawPublicUrl
            ? /^[a-zA-Z]+:\/\//.test(rawPublicUrl)
                ? rawPublicUrl
                : `${protocol}://${rawPublicUrl}`
            : null
        
        /*  返回 object
            lanUrlForConfig, // IP 地址
            lanUrlForTerminal, // 完整地址，且 host 为获取的 IP 地址(prot 打印出有高亮色)
            localUrlForTerminal, // 完整地址，且 host 为 'localhost' 或 用户设置的值(prot 打印出有高亮色)
            localUrlForBrowser // 完整地址，且 host 为 'localhost' 或 用户设置的值
         */
        const urls = prepareURLs(
            protocol,
            host,
            port,
            isAbsoluteUrl(options.publicPath) ? '/' : options.publicPath
        )
        // console.log('urls====')
        // console.log(urls)
        const localUrlForBrowser = publicUrl || urls.localUrlForBrowser
        
        // 加载并解析 devServer.proxy 配置
        // [ { target: 'url', context: fn(), onProxyReq: fn(), onError: fn() }, ... ]
        const proxySettings = prepareProxy(
            projectDevServerOptions.proxy,
            api.resolve('public')
        )

        // 注入 dev & hot-reload 条目
        /*  以 Node.js API 启动 webpack-dev-server 时，配置中无 inline 选项
            webpack.entry 选项中添加 webpack-dev-server/client?http://<path>:<port>/
        */
        /*  启用热模块替换时
            webpack.entry 选项中添加 webpack/hot/dev-server
            webpack.plugins 选项中添加 new webpack.HotModuleReplacementPlugin()
            devServer 的配置中添加 hot:true
        */ 
        if (!isProduction) {
            // 获取 http://<path>:<port>/sockjs-node
            const sockjsUrl = publicUrl
            // 通过 devServer.public 配置
            ? `?${publicUrl}/sockjs-node`
            : isInContainer
                // 如果在容器中无法推断公网的 url
                // 使用客户端推断（注意，这将与非 root 用户 publicPath 冲突）
                ? ``
                // 否则推断网址
                : `?` + url.format({
                    protocol,
                    port,
                    hostname: urls.lanUrlForConfig || 'localhost',
                    pathname: '/sockjs-node'
                })
            console.log('sockjsUrl===========')
            console.log(sockjsUrl)
            
            // 生成 webpack-dev-server/client?http://<path>:<port>/、webpack/hot/dev-server
            const devClients = [
                // dev server client
                require.resolve(`webpack-dev-server/client`) + sockjsUrl,
                // hmr client
                require.resolve(projectDevServerOptions.hotOnly
                    ? 'webpack/hot/only-dev-server'
                    : 'webpack/hot/dev-server')
            ]

            // https://www.webpackjs.com/configuration/dev-server/#devserver-inline
            if (process.env.APPVEYOR) {
                devClients.push(`webpack/hot/poll?500`)
            }

            // 注入 dev/hot 到 webpack.entry
            addDevClientToEntry(webpackConfig, devClients)
        }

        // 创建 webpack compiler
        const compiler = webpack(webpackConfig)

        // 创建 devServer
        // https://webpack.js.org/configuration/dev-server/#devserver
        const server = new WebpackDevServer(compiler, Object.assign({
            logLevel: 'silent',
            clientLogLevel: 'silent',
            historyApiFallback: {
                disableDotRule: true,
                rewrites: genHistoryApiFallbackRewrites(options.publicPath, options.pages)
            },
            // 告诉服务器从哪里提供内容。只有在你想要提供静态文件时才需要。
            // devServer.publicPath 将用于确定应该从哪里提供 bundle，并且此选项优先。
            contentBase: api.resolve('public'),
            watchContentBase: !isProduction,
            hot: !isProduction,
            injectClient: false,
            compress: isProduction,
            publicPath: options.publicPath,
            overlay: isProduction // TODO disable this
                ? false
                : { warnings: false, errors: true }
        }, projectDevServerOptions, {
            https: useHttps,
            proxy: proxySettings,
            // eslint-disable-next-line no-shadow
            before (app, server) {
                // launch editor support.
                // this works with vue-devtools & @vue/cli-overlay
                // app.use('/__open-in-editor', launchEditorMiddleware(() => console.log(
                //     `To specify an editor, specify the EDITOR env variable or ` +
                //     `add "editor" field to your Vue project config.\n`
                // )))

                // allow other plugins to register middlewares, e.g. PWA
                // api.service.devServerConfigFns.forEach(fn => fn(app, server))
                
                // apply in project middlewares
                projectDevServerOptions.before && projectDevServerOptions.before(app, server)
            },
            // 避免打开浏览器
            open: false
        }))

        // 关闭服务器并正常的结束进程
        // SIGINT 终止进程，产生方式: 键盘 Ctrl+C
        // SIGTERM 终止进程，产生方式: 和任何控制字符无关,用 kill 函数发送，相当于 shell> kill(不加 -9) pid(进程号).
        ;['SIGINT', 'SIGTERM'].forEach(signal => {
            process.on(signal, () => {
                server.close(() => {
                    process.exit(0)
                })
            })
        })

        // 后续研究。。。
        if (args.stdin) {
            process.stdin.on('end', () => {
                server.close(() => {
                    process.exit(0)
                })
            })
      
            process.stdin.resume()
        }

        // 后续研究。。。
        // on appveyor, killing the process with SIGTERM causes execa to
        // throw error
        if (process.env.VUE_CLI_TEST) {
            process.stdin.on('data', data => {
                if (data.toString() === 'close') {
                    console.log('got close signal!')
                    server.close(() => {
                        process.exit(0)
                    })
                }
            })
        }

        return new Promise((resolve,  reject) => {
            // 首次编译完成时，打印日志说明并打开浏览器
            let isFirstCompile = true
            compiler.hooks.done.tap('vue-cli-service serve', stats => {
                console.log('111111')
                console.log(stats.hasErrors())
                console.log(stats.toString())
                if (stats.hasErrors()) {
                    return
                }

                let copied = ''

                console.log()
                console.log(`  App running at:`)
                console.log(`  - Local:   ${chalk.cyan(urls.localUrlForTerminal)} ${copied}`)
                console.log('aaaaaaaa=============')
                resolve({
                    server,
                    url: 'aaaaaaaa'
                })
            })
            server.listen(port, host, err => {
                if (err) {
                    reject(err)
                }
            })
        })
        
    })
}

// 添加条目到 webpack.entry
function addDevClientToEntry (config, devClient) {
    const { entry } = config
    if (typeof entry === 'object' && !Array.isArray(entry)) {
        Object.keys(entry).forEach((key) => {
            entry[key] = devClient.concat(entry[key])
        })
    } else if (typeof entry === 'function') {
        config.entry = entry(devClient)
    } else {
        config.entry = devClient.concat(entry)
    }
}

// https://stackoverflow.com/a/20012536
// 判断是否在 LXC、Docker 容器中
function checkInContainer () {
    const fs = require('fs')
    if (fs.existsSync(`/proc/1/cgroup`)) {
      const content = fs.readFileSync(`/proc/1/cgroup`, 'utf-8')
      return /:\/(lxc|docker|kubepods)\//.test(content)
    }
}

// 生成 devServer.historyApiFallback.rewrites 配置项
// https://webpack.js.org/configuration/dev-server/#devserverhistoryapifallback
function genHistoryApiFallbackRewrites (baseUrl, pages = {}) {
    const path = require('path')
    const multiPageRewrites = Object.keys(pages)
        // 按长度的倒序排序以避免覆盖
        // 如 'page11' 应该出现在 'page1' 前面
        .sort((a, b) => b.length - a.length)
        .map(name => ({
            from: new RegExp(`^/${name}`),
            to: path.posix.join(baseUrl, pages[name].filename || `${name}.html`)
        }))
    return [
        ...multiPageRewrites,
        { from: /./, to: path.posix.join(baseUrl, 'index.html') }
    ]
}

module.exports.defaultModes = {
    serve: 'development'
}