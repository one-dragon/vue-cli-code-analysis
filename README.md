# vue-cli 源码解析，并尝试添加服务端渲染代码配置

持续更新中。。。


## 发展方向

解析 vue-cli 源码 --> 加入服务端渲染（可配置是否开启服务端渲染） --> 实现微前端部署（大项目可进行分割成多个子项目独立开发部署）

## vue-cli 源码解析

### 运行编译命令
在运行 `npm run serve` 时，调用的是 `vue-cli-service serve` 命令，此时走的是 `node_modules/.bin/vue-cli-service.cmd`(windows下) 中的逻辑：

```
    @IF EXIST "%~dp0\node.exe" (
        "%~dp0\node.exe"  "%~dp0\..\@vue\cli-service\bin\vue-cli-service.js" %*
    ) ELSE (
        @SETLOCAL
        @SET PATHEXT=%PATHEXT:;.JS;=;%
        node  "%~dp0\..\@vue\cli-service\bin\vue-cli-service.js" %*
    )
```
可看出不管判断走哪个逻辑，最后都是调用 `node node_modules/@vue/cli-service/bin/vue-cli-service.js`

### @vue/cli-service

在 `@vue/cli-service` 中，就是 webpack 配置的主要逻辑目录。

在 `bin/vue-cli-service.js` 文件中，是起始的运行文件，不管是运行 `npm run serve` 还是 `npm run build`，都会运行这个文件。
它主要干了三件事，首先进行 `new Service` 类，然后解析命令行参数（如配置 vue-cli-service serve --open --copy），最后把解析的参数和调用的命令（serve、build）传入 `Service.run(command, args, rawArgv)` 中进行正式编译。

在 `lib/Service.js` 中（上文提到的 Service 类），做了很多事，初始化代码如下：
``` javascript
    constructor(context, { plugins, pkg, inlineOptions, useBuiltIn } = {}) {
        process.VUE_CLI_SERVICE = this

        this.initialized = false // 是否已初始化，防止重复调用

        // 当前执行 node 命令所在的文件夹地址，
        // 一般在项目根目录下
        this.context = context

        this.inlineOptions = inlineOptions // 初始化传入 '内联配置'

        this.webpackChainFns = [] // 链式配置函数列表 [ fn, ... ]，对应 config.chainWebpack 选项
        this.webpackRawConfigFns = [] // 原始的 webpack 配置列表 [ fn, obj, ... ]，对应 config.configureWebpack 选项
        this.devServerConfigFns = []

        this.commands = {} // 运行命令集合，如 { serve: { fn, opts}, ... }

        // 包含目标插件的 package.json 的文件夹地址，
        // 默认为 this.context 项目根目录下
        this.pkgContext = context
        // 包含插件的 package.json，解析本地自定义插件内容
        this.pkg = this.resolvePkg(pkg)

        // 如果有内联插件，则将使用它们，而不是 package.json 中的插件。
        // 当 useBuiltIn === false 时，将禁用内置插件。这主要是为了测试。
        // 返回：[ { id: 'built-in:commands/serve', apply: fn }, ... ]
        this.plugins = this.resolvePlugins(plugins, useBuiltIn)
        // pluginsToSkip 将在运行 run() 期间填充
        // 调用插件(this.plugins)时判断是否跳过
        this.pluginsToSkip = new Set()

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
    }
```
