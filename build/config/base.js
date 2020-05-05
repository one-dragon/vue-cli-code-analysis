
module.exports = (api, options) => {
    api.chainWebpack(webpackConfig => {
        // VUE_CLI_MODERN_MODE：args.modern && args.target === 'app' 时为 true，build 时使用
        // VUE_CLI_MODERN_BUILD：测试时使用，使用现代模式避免打包加入 polyfills
        // 是否使用现代模式构建应用并构建目标为 app 应用，且不为测试时设置的 VUE_CLI_MODERN_BUILD
        const isLegacyBundle = process.env.VUE_CLI_MODERN_MODE && !process.env.VUE_CLI_MODERN_BUILD
        // 返回当前工程根下的文件夹地址
        const resolveLocal = require('../util/resolveLocal')
        // 返回静态资源的文件夹地址
        const getAssetPath = require('../util/getAssetPath')
        // 设置内联文件生成 Data URL 的字节限制
        const inlineLimit = 4096

        // 放置生成的静态资源 (js、css、img、fonts) 的 (相对于 outputDir 的) 目录。
        const genAssetSubPath = dir => {
            return getAssetPath(
                options,
                `${dir}/[name]${options.filenameHashing ? '.[hash:8]' : ''}.[ext]`
            )
        }

        // url-loader 配置项返回
        // http://webpack.html.cn/loaders/url-loader.html
        const genUrlLoaderOptions = dir => {
            return {
                limit: inlineLimit,
                // url-loader >= 1.1.0 时，当文件大于限制时，为文件指定加载程序（以字节为单位）
                fallback: {
                    // http://webpack.html.cn/loaders/file-loader.html
                    loader: require.resolve('file-loader'),
                    options: {
                        name: genAssetSubPath(dir) // 配置自定义文件名模板: [path][name]-[hash].[ext]
                    }
                }
            }
        }

        webpackConfig
            .mode('development')
            // 基础目录，绝对路径，用于从配置中解析入口起点(entry point)和 loader
            // 默认使用当前目录，但是推荐在配置中传递一个值。这使得你的配置独立于 CWD(current working directory - 当前执行路径)
            .context(api.service.context)
            .entry('app')
                .add('./src/main.js') // 默认打包 main.js
                .end()
            .output
                .path(api.resolve(options.outputDir)) // 默认打包后生成 dist 文件夹
                .filename(isLegacyBundle ? '[name]-legacy.js' : '[name].js')
                .publicPath(options.publicPath)
            
        /**
         * https://github.com/arcanis/pnp-webpack-plugin
         * 
         * resolve 选项将负责正确解析程序所需的依赖项，
         * resolveLoader 选项将帮助 Webpack 查找磁盘上加载程序的位置。
         * 在这种情况下，所有加载程序都将相对于包含您的配置的包进行解析。
         * 
         * 如果部分配置来自使用自己加载程序的第三方包，请确保它们使用 require.resolve
         * - 这将确保解析过程是可移植的跨环境（包括 Plug'n'Play 未启用），并防止它依赖于未定义的行为
         */
        webpackConfig.resolve
            // webpack5 中默认支持 pnp-webpack-plugin，可移除次配置
            // https://webpack.js.org/migrate/5/#clean-up-configuration
            .plugin('pnp')
                .use({ ...require('pnp-webpack-plugin') })
                .end()
            .extensions // 自动解析确定的扩展。默认值为 [".js", ".json"]
                .merge(['.mjs', '.js', '.jsx', '.vue', '.json', '.wasm'])
                .end()
            .modules // 告诉 webpack 解析模块时应该搜索的目录
                .add('node_modules')
                .add(api.resolve('node_modules'))
                .add(resolveLocal('node_modules'))
                .end()
            .alias // 创建 import 或 require 的别名，也可以在给定对象的键后的末尾添加 $，以表示精准匹配
                .set('@', api.resolve('src'))
                .set(
                    'vue$',
                    options.runtimeCompiler // 是否使用包含运行时编译器的 Vue 构建版本。默认 false
                        ? 'vue/dist/vue.esm.js'
                        : 'vue/dist/vue.runtime.esm.js'
                )
        webpackConfig.resolveLoader
            .plugin('pnp-loaders')
                .use({ ...require('pnp-webpack-plugin').topLevelLoader })
                .end()
            .modules
                .add('node_modules')
                .add(api.resolve('node_modules'))
                .add(resolveLocal('node_modules'))
            
        webpackConfig.module
            // 过滤不需要解析的文件（文件中不会引用其他的包），提高打包效率
            .noParse(/^(vue|vue-router|vuex|vuex-router-sync)$/)

        // js is handled by cli-plugin-babel； js 由 cli-plugin-babel 处理 ---------------------------------------

        // vue-loader 配置--------------------------------------------------------------
        // partialIdentifier 参数设置
        const vueLoaderCacheIdentifier = {
            'vue-loader': require('vue-loader/package.json').version
        }
        // Vue 2 项目中肯定存在以下 2 个 deps。 
        // 但是一旦我们切换到 Vue 3，它们就不再是必需的。
        // 在 Vue 3 中，它们应该被 @vue/compiler-sfc 替换，
        // 所以把它们包在一个 try catch 块中。
        try {
            vueLoaderCacheIdentifier['@vue/component-compiler-utils'] =
                require('@vue/component-compiler-utils/package.json').version
            vueLoaderCacheIdentifier['vue-template-compiler'] =
                require('vue-template-compiler/package.json').version
        } catch (e) {}
        // 通过传入 id 和 partialIdentifier 生成返回 '缓存目录路径' 和 '缓存哈希值'
        // 返回 { cacheDirectory, cacheIdentifier }
        const vueLoaderCacheConfig = api.genCacheConfig('vue-loader', vueLoaderCacheIdentifier)

        // https://github.com/Yatoo2018/webpack-chain/tree/zh-cmn-Hans#%E9%85%8D%E7%BD%AE-module-rules-uses-loaders-%E5%88%9B%E5%BB%BA
        webpackConfig.module
            .rule('vue')
                .test(/\.vue$/)
                .use('cache-loader')
                    .loader(require.resolve('cache-loader'))
                    .options(vueLoaderCacheConfig)
                    .end()
                .use('vue-loader')
                    .loader(require.resolve('vue-loader'))
                    .options(Object.assign({ // https://vue-loader.vuejs.org/zh/options.html#compileroptions
                        compilerOptions: {
                            whitespace: 'condense'
                        }
                    }, vueLoaderCacheConfig))
        
        // https://github.com/Yatoo2018/webpack-chain/tree/zh-cmn-Hans#%E9%85%8D%E7%BD%AE%E6%8F%92%E4%BB%B6
        webpackConfig
            .plugin('vue-loader')
            .use(require('vue-loader/lib/plugin'))
        
        // static assets 静态资源配置-----------------------------------------------------------
        
        webpackConfig.module
            .rule('images')
                .test(/\.(png|jpe?g|gif|webp)(\?.*)?$/)
                .use('url-loader')
                    .loader(require.resolve('url-loader'))
                    .options(genUrlLoaderOptions('img'))
        
        // 不要使用 base64-inline SVGs
        // https://github.com/facebookincubator/create-react-app/pull/1180
        webpackConfig.module
            .rule('svg')
                .test(/\.(svg)(\?.*)?$/)
                .use('file-loader')
                    .loader(require.resolve('file-loader'))
                    .options({
                        name: genAssetSubPath('img')
                    })
        
        webpackConfig.module
            .rule('media')
                .test(/\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/)
                .use('url-loader')
                    .loader(require.resolve('url-loader'))
                    .options(genUrlLoaderOptions('media'))
        
        webpackConfig.module
            .rule('fonts')
                .test(/\.(woff2?|eot|ttf|otf)(\?.*)?$/i)
                .use('url-loader')
                    .loader(require.resolve('url-loader'))
                    .options(genUrlLoaderOptions('fonts'))
        
        // Other common pre-processors 其他常用预处理器设置---------------------------------------------
                 
        const maybeResolve = name => {
            try {
                return require.resolve(name)
            } catch (error) {
                return name
            }
        }

        // https://github.com/Yatoo2018/webpack-chain/tree/zh-cmn-Hans#%E9%85%8D%E7%BD%AE-module-rules-oneofs-%E6%9D%A1%E4%BB%B6-rules
        // 支持 pug 模板
        webpackConfig.module
            .rule('pug') // https://vue-loader.vuejs.org/zh/guide/pre-processors.html#pug
                .test(/\.pug$/)
                    .oneOf('pug-vue')
                        // 这条规则应用到 Vue 组件内的 `<template lang="pug">`
                        .resourceQuery(/vue/)
                        .use('pug-plain-loader')
                            .loader(maybeResolve('pug-plain-loader'))
                            .end()
                        .end()
                    .oneOf('pug-template')
                        // 这条规则应用到 JavaScript 内的 pug 导入
                        .use('raw')
                            .loader(maybeResolve('raw-loader'))
                            .end()
                        .use('pug-plain-loader')
                            .loader(maybeResolve('pug-plain-loader'))
                            .end()
                        .end()

        // shims

        /**
         * 这些选项可以配置是否 polyfill 或 mock 某些 Node.js 全局变量和模块。
         * 这可以使最初为 Node.js 环境编写的代码，在其他环境（如浏览器）中运行
         * 
         * 此功能由 webpack 内部的 NodeStuffPlugin 插件提供。
         * 如果 target 是 "web"（默认）或 "webworker"，那么 NodeSourcePlugin 插件也会被激活。
         * 
         * 从 webpack 3.0.0 开始，node 选项可能被设置为 false，
         * 以完全关闭 NodeStuffPlugin 和 NodeSourcePlugin 插件。
         */
        // http://webpack.html.cn/configuration/node.html
        webpackConfig.node
            .merge({
                // 防止 webpack 注入无用的 setImmediate polyfill，
                // 因为 Vue 源包含它（尽管只有在它是 native 的情况下才使用它）。
                setImmediate: false,
                // process 是通过 DefinePlugin 注入的，
                // 尽管一些第三方库可能需要一个 mock 才能正常工作（#934）
                process: 'mock',
                // 防止 webpack 将 mock 注入到对客户端没有意义的 Node 模块
                dgram: 'empty',
                fs: 'empty',
                net: 'empty',
                tls: 'empty',
                child_process: 'empty'
            })
        
        // 加载本地设置的 .env 文件的全局变量到 DefinePlugin 中
        // 全局环境变量设置到 DefinePlugin 中
        // options.publicPath 设置到 DefinePlugin 中（BASE_URL）
        const resolveClientEnv = require('../util/resolveClientEnv')
        webpackConfig
            .plugin('define')
                .use(require('webpack').DefinePlugin, [
                    resolveClientEnv(options)
                ])

        // 强制执行所有必须模块的整个路径，匹配磁盘上实际路径的确切大小写。
        // 意味着可以忽略大小写的问题，避免大小写问题引起的麻烦。
        // 有时你会发现 Mac 上 webpack 编译没有问题，但是到 linux 机器上就不行了，
        // 这是因为 Mac 系统是大小写不敏感，避免的办法是使用 case-sensitive-paths-webpack-plugin 模块
        // https://www.npmjs.com/package/case-sensitive-paths-webpack-plugin
        webpackConfig
            .plugin('case-sensitive-paths')
                .use(require('case-sensitive-paths-webpack-plugin'))
        
        // 当 webpack 解析一个 loader 失败时，
        // friendly-errors-webpack-plugin 会显示非常混乱的错误提示信息
        // 因此需提供自定义处理程序来改进它
        // https://www.npmjs.com/package/@soda/friendly-errors-webpack-plugin
        const { transformer, formatter } = require('../util/resolveLoaderError')
        webpackConfig
            .plugin('friendly-errors')
                .use(require('@soda/friendly-errors-webpack-plugin'), [
                    {
                        additionalTransformers: [transformer],
                        additionalFormatters: [formatter]
                    }
                ])
        
        // 用 terser-webpack-plugin 替换掉 uglifyjs-webpack-plugin 解决 uglifyjs 不支持 es6 语法问题
        // 支持 ES6 的语法压缩，因为可设置现代模式进行打包
        const TerserPlugin = require('terser-webpack-plugin')
        const terserOptions = require('./terserOptions')
        webpackConfig.optimization
            .minimizer('terser')
                .use(TerserPlugin, [ terserOptions(options) ])
    })
}