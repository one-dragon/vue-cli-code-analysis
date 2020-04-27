
module.exports = (api, options) => {
    api.chainWebpack(webpackConfig => {

        // VUE_CLI_MODERN_MODE：args.modern && args.target === 'app' 时为 true，build 时使用
        // VUE_CLI_MODERN_BUILD：测试时使用，现代模式避免打包加入 polyfills
        const isLegacyBundle = process.env.VUE_CLI_MODERN_MODE && !process.env.VUE_CLI_MODERN_BUILD
        const resolveLocal = require('../util/resolveLocal') // 返回当前工程根下的文件夹地址

        webpackConfig
            .mode('development')
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
                .extensions
                    .merge(['.mjs', '.js', '.jsx', '.vue', '.json', '.wasm'])
                    .end()
                .modules
                    .add('node_modules')
                    .add(api.resolve('node_modules'))
                    .add(resolveLocal('node_modules'))
                    .end()
                .alias
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
                // 过滤不需要解析的文件，提高打包效率
                .noParse(/^(vue|vue-router|vuex|vuex-router-sync)$/)

            // js is handled by cli-plugin-babel ---------------------------------------
    })
}