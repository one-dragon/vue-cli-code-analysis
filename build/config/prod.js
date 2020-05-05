
module.exports = (api, options) => {
    api.chainWebpack(webpackConfig => {
        if (process.env.NODE_ENV === 'production') {
            webpackConfig
                .mode('production')
                .devtool(options.productionSourceMap ? 'source-map' : false)
            
            // 在 vendor 模块未更改时，保持 module.id 的稳定
            // http://webpack.html.cn/plugins/hashed-module-ids-plugin.html
            webpackConfig
                .plugin('hash-module-ids')
                    .use(require('webpack/lib/HashedModuleIdsPlugin'), [
                        {
                            hashDigest: 'hex'
                        }
                    ])
            
            // 在测试期间禁用 optimization 以加快速度
            if (process.env.VUE_CLI_TEST) {
                webpackConfig.optimization.minimize(false)
            }
        }
    })
}