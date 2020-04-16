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

在 `lib/Service.js` 中（上文提到的 Service 类），做了很多事，以后更新。
