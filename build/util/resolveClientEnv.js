const prefixRE = /^VUE_APP_/

// Service.init() 中调用 loadEnv 函数获取 .env 文件中设置的全局变量
// 从 process.env 获取 .env 文件中设置的全局变量并返回（并包含环境变量和 publicPath）
module.exports = function resolveClientEnv (options, raw) {
    const env = {}
    Object.keys(process.env).forEach(key => {
        if (prefixRE.test(key) || key === 'NODE_ENV') {
            env[key] = process.env[key]
        }
    })
    env.BASE_URL = options.publicPath

    if (raw) {
        return env
    }

    for (const key in env) {
        env[key] = JSON.stringify(env[key])
    }
    return {
        'process.env': env
    }
}
