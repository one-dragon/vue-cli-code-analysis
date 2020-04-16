
module.exports = (api, options) => {
    api.chainWebpack(webpackConfig => {


        webpackConfig
            .mode('development')
            .context(api.service.context)
            .entry('app')
                .add('./src/main.js')
                .end()
            .output
                .path(api.resolve('dist'))
                .filename('[name].js')
                .publicPath('/')
    })
}