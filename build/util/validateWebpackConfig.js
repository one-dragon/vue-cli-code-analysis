
// 验证 webpack 配置
module.exports = function validateWebpackConfig (
    webpackConfig,
    api,
    options,
    target = 'app'
) {
    const singleConfig = Array.isArray(webpackConfig)
        ? webpackConfig[0]
        : webpackConfig
    
    const actualTargetDir = singleConfig.output.path

    if (actualTargetDir !== api.resolve(options.outputDir)) {
        // 用户直接在 configureWebpack 或 chainWebpack 中修改 output.path，
        // 不支持此操作，因为我们无法通过这种方式为复制插件提供正确的值
        throw new Error(
          `\n\nConfiguration Error: ` +
          `Avoid modifying webpack output.path directly. ` +
          `Use the "outputDir" option instead.\n`
        )
    }

    // 不能设置输出目录为项目根目录
    if (actualTargetDir === api.service.context) {
        throw new Error(
          `\n\nConfiguration Error: ` +
          `Do not set output directory to project root.\n`
        )
    }

    // 避免直接修改 webpack.output.publicPath
    // 改用 'publicPath' 选项
    if (target === 'app' && singleConfig.output.publicPath !== options.publicPath) {
        throw new Error(
          `\n\nConfiguration Error: ` +
          `Avoid modifying webpack output.publicPath directly. ` +
          `Use the "publicPath" option instead.\n`
        )
    }
}