
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
    api.chainWebpack(webpackConfig => {
        // 仅在没有其他目标时适用
        // VUE_CLI_BUILD_TARGET 从 args.target 获取
        if (process.env.VUE_CLI_BUILD_TARGET && process.env.VUE_CLI_BUILD_TARGET !== 'app') {
            return
        }

        const isProd = process.env.NODE_ENV === 'production'
        // VUE_CLI_MODERN_MODE：args.modern && args.target === 'app' 时为 true，build 时使用
        // VUE_CLI_MODERN_BUILD：测试时使用，使用现代模式避免打包加入 polyfills
        // 是否使用现代模式构建应用并构建目标为 app 应用，且不为测试时设置的 VUE_CLI_MODERN_BUILD
        const isLegacyBundle = process.env.VUE_CLI_MODERN_MODE && !process.env.VUE_CLI_MODERN_BUILD
        // 生产环境构建文件的目录，默认 dist
        const outputDir = api.resolve(options.outputDir)

        // 返回静态资源的文件地址
        const getAssetPath = require('../util/getAssetPath')
        const outputFilename = getAssetPath( // 设置生成 js 文件名
            options,
            `js/[name]${isLegacyBundle ? `-legacy` : ``}${isProd && options.filenameHashing ? '.[contenthash:8]' : ''}.js`
        )
        webpackConfig
            .output
                .filename(outputFilename)
                .chunkFilename(outputFilename)

        // code splitting 代码分割设置
        if (process.env.NODE_ENV !== 'test') {
            let aa = {
                splitChunks: {
                    chunks: 'async',
                    minSize: 30000,
                    maxSize: 0,
                    minChunks: 1,
                    maxAsyncRequests: 5,
                    maxInitialRequests: 3,
                    automaticNameDelimiter: '~',
                    name: true,
                    cacheGroups: {
                        vendors: {
                            test: /[\\/]node_modules[\\/]/,
                            priority: -10
                        },
                        default: {
                            minChunks: 2,
                            priority: -20,
                            reuseExistingChunk: true
                        }
                    }
                }
            }
            /**
             * splitChunks: {
                    chunks: 'async', // 默认作用于异步chunk，值为all/initial/async/function(chunk),值为function时第一个参数为遍历所有入口chunk时的chunk模块，chunk._modules为chunk所有依赖的模块，通过chunk的名字和所有依赖模块的resource可以自由配置,会抽取所有满足条件chunk的公有模块，以及模块的所有依赖模块，包括css
                    minSize: 30000, // 表示在压缩前的最小模块大小,默认值是30kb
                    minChunks: 1, // 表示被引用次数，默认为1；
                    maxAsyncRequests: 5, // 所有异步请求不得超过5个
                    maxInitialRequests: 3, // 初始话并行请求不得超过3个
                    automaticNameDelimiter:'~', // 名称分隔符，默认是~
                    name: true, // 打包后的名称，默认是chunk的名字通过分隔符（默认是～）分隔
                    cacheGroups: { // 设置缓存组用来抽取满足不同规则的chunk,下面以生成common为例
                        common: {
                            name: 'common',  // 抽取的chunk的名字
                            chunks(chunk) { // 同外层的参数配置，覆盖外层的chunks，以chunk为维度进行抽取
                            },
                            test(module, chunks) { // 可以为字符串，正则表达式，函数，以module为维度进行抽取，只要是满足条件的module都会被抽取到该common的chunk中，为函数时第一个参数是遍历到的每一个模块，第二个参数是每一个引用到该模块的chunks数组。自己尝试过程中发现不能提取出css，待进一步验证。
                            },
                            priority: 10, // 优先级，一个chunk很可能满足多个缓存组，会被抽取到优先级高的缓存组中
                            minChunks: 2, // 最少被几个chunk引用
                            reuseExistingChunk: true, // 如果该chunk中引用了已经被抽取的chunk，直接引用该chunk，不会重复打包代码
                            enforce: true // 如果cacheGroup中没有设置minSize，则据此判断是否使用上层的minSize，true：则使用0，false：使用上层minSize
                        }
                    }
                }
             */
            webpackConfig
                .optimization.splitChunks({

                })
        }


    })
}
