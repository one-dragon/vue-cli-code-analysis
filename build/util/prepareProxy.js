/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file at
 * https://github.com/facebookincubator/create-react-app/blob/master/LICENSE
*/

const fs = require('fs')
const url = require('url')
const path = require('path')
const chalk = require('chalk')
const address = require('address')

// https://github.com/chimurai/http-proxy-middleware#options
const defaultConfig = {
    logLevel: 'silent', // ['debug', 'info', 'warn', 'error', 'silent']. Default: 'info'
    secure: false, //  if you want to verify the SSL Certs
    changeOrigin: true, // Default: false - changes the origin of the host header to the target URL
    ws: true, // if you want to proxy websockets
    xfwd: true // adds x-forward headers
}

// 解析传入的 devServer.proxy 内容并返回
module.exports = function (proxy, appPublicFolder) {
    // "proxy" 允许为特定请求指定备用服务器
    // 可以是字符串，也可以是符合 devServer.proxy 的配置选项
    // https://www.webpackjs.com/configuration/dev-server/#devserver-proxy
    if (!proxy) {
        return undefined
    }

    // 不允许设置 'proxy' 为其他类型(除了 string、object)
    if (Array.isArray(proxy) || (typeof proxy !== 'object' && typeof proxy !== 'string')) {
        console.log(
            chalk.red(
                'When specified, "proxy" in package.json must be a string or an object.'
            )
        )
        console.log(
            chalk.red('Instead, the type of "proxy" was "' + typeof proxy + '".')
        )
        console.log(
            chalk.red(
                'Either remove "proxy" from package.json, or make it an object.'
            )
        )
        process.exit(1) // 退出当前进程，并返回一个 code 码， 0 正常退出，1 非正常退出
    }

    // devServer.sockPath: string = '/sockjs-node'
    // The path at which to connect to the reloading socket.
    // https://webpack.js.org/configuration/dev-server/#devserversockpath

    // 如果指定了 proxy，则让它处理的请求不能包括，公共文件夹路径和热加载载入的路径
    // 判断代理的路径是否不为，静态资源路径 或 热加载载入的路径
    function mayProxy (pathname) { // pathname: /xx/xx
        // appPublicFolder: 静态资源文件夹，这类资源将会直接被拷贝，而不会经过 webpack 的处理
        const maybePublicPath = path.resolve(appPublicFolder, pathname.slice(1))
        // 判断代理的路径是否在静态资源文件夹中
        const isPublicFileRequest = fs.existsSync(maybePublicPath)
        // 热加载时载入的 websocket 链接
        const isWdsEndpointRequest = pathname.startsWith('/sockjs-node') // used by webpackHotDevClient
        return !(isPublicFileRequest || isWdsEndpointRequest)
    }

    // 创建 proxy 入口
    function createProxyEntry (target, usersOnProxyReq, context) {
        // 有一个鲜为人知的案例，即可以设置 target 为一个对象而不是字符串
        // https://github.com/chimurai/http-proxy-middleware/blob/master/recipes/https.md#proxy-to-an-https-server-using-a-pkcs12-client-certificate
        if (typeof target === 'string' && process.platform === 'win32') {
            target = resolveLoopback(target) // 解析判断 proxy.target 并返回
        }

        // https://www.webpackjs.com/configuration/dev-server/#devserver-proxy
        // https://github.com/chimurai/http-proxy-middleware#options
        return {
            target,
            // https://github.com/chimurai/http-proxy-middleware#context-matching
            // 其中可传入 context 为一个 function 进行自定义过滤并返回 true/false
            // 也可以传入 string/[string, string, ...]
            context (pathname, req) {
                if (!mayProxy(pathname)) { // 判断代理的路径是否不为，静态资源路径 或 热加载载入的路径
                    return false
                }

                if (context) {
                    // 此处代表设置的 devServer.proxy 为 object(proxy: { '/api': { target: '<url>' } })
                    // 直接判断并返回请求路径是否匹配设置的 /api
                    return pathname.match(context)
                } else {
                    // 此处代表设置的 devServer.proxy 为 string(proxy: 'http://localhost:4000')
                    if (req.method !== 'GET') { // 不为 GET 请求，代表不是静态请求
                        return true
                    }

                    // 如果请求头的 'accept' 是 'text/html'，将会加载 /index.html
                    // 而现代浏览器在加载时，请求头的 'accept' 会包含 'text/html'
                    // 然而像 'fetch()' 这样的 API 通常不会接受 'text/html'
                    // 如果这种启发式方法对您而言效果不佳，请使用自定义的 `proxy` 对象。
                    return (
                        req.headers.accept &&
                        req.headers.accept.indexOf('text/html') === -1
                    )
                }
            },
            onProxyReq (proxyReq, req, res) {
                if (usersOnProxyReq) { // 如果用户自定义了 onProxyReq，会进行调用
                    usersOnProxyReq(proxyReq, req, res)
                }
                // Browsers may send Origin headers even with same-origin
                // requests. To prevent CORS issues, we have to change
                // the Origin to match the target URL.
                // 判断并设置请求头的 origin 为当前设置的代理地址
                if (!proxyReq.agent && proxyReq.getHeader('origin')) {
                    proxyReq.setHeader('origin', target)
                }
            },
            onError: onProxyError(target)
        }
    }


    // 对于想使用简单的 'proxy' 选项，支持设置为字符串
    // proxy: 'http://localhost:4000'
    if (typeof proxy === 'string') {
        if (!/^http(s)?:\/\//.test(proxy)) { // 起始值不为 http:// 或 https://，报错并退出进程
            console.log(
                chalk.red(
                    'When "proxy" is specified in package.json it must start with either http:// or https://'
                )
            )
            process.exit(1)
        }
    
        return [
            Object.assign({}, defaultConfig, createProxyEntry(proxy))
        ]
    }

    // proxy 为一个对象时，创建一个代理数组并传递给 webpackDevServer
    // proxy: { '/api': { target: '<url>', ws: true, changeOrigin: true } }
    // https://github.com/chimurai/http-proxy-middleware#example
    return Object.keys(proxy).map(context => {
        const config = proxy[context]
        // 设置代理时没有定义 target 选项，报错
        if (!config.hasOwnProperty('target')) {
            console.log(
                chalk.red(
                    'When `proxy` in package.json is an object, each `context` object must have a ' +
                        '`target` property specified as a url string'
                )
            )
            process.exit(1)
        }

        const entry = createProxyEntry(config.target, config.onProxyReq, context)
        // 返回设置的 devServer.proxy 最终内容
        // [ { target: 'url', context: fn(), onProxyReq: fn(), onError: fn() } ]
        return Object.assign({}, defaultConfig, config, entry)
    })
}

// 解析判断 proxy.target 并返回
function resolveLoopback (proxy) {
    /*  url.parse('http://localhost:4000')
        {
            protocol: 'http:',
            slashes: true,
            auth: null,
            host: 'localhost:4000',
            port: '4000',
            hostname: 'localhost',
            hash: null,
            search: null,
            query: null,
            pathname: '/',
            path: '/',
            href: 'http://localhost:4000/' 
        }
    */
    // let obj = { protocol: 'http:', slashes: true, auth: null, host: undefined, port: '4000', hostname: '127.0.0.1', hash: null, search: null, query: null, pathname: '/', path: '/', href: 'http://localhost:4000/' }
    const o = url.parse(proxy)
    o.host = undefined
    if (o.hostname !== 'localhost') {
        return proxy
    }
    // 不幸的是，许多语言(与 node 不同)尚不支持 IPv6，这意味着即使解析本地主机为 ::1，
    // 应用程序也必须回退到 IPv4(即 127.0.0.1)
    // 可以在几年内重新启用它
    /* try {
        o.hostname = address.ipv6() ? '::1' : '127.0.0.1';
    } catch (_ignored) {
        o.hostname = '127.0.0.1';
    }*/

    try {
        // 检查是否处于网络中，如果处于网络中则可能会解析本地主机 IP，
        // 否则可以认为 localhost 是 IPv4 的最大兼容性值
        if (!address.ip()) {
            o.hostname = '127.0.0.1'
        }
    } catch (_ignored) {
        o.hostname = '127.0.0.1'
    }
    return url.format(o)
}

// 需要为 httpProxyMiddleware 提供自定义 onError 函数。它允许我们在控制台上记录自定义错误消息。
function onProxyError (proxy) {
    return (err, req, res) => {
        const host = req.headers && req.headers.host
        console.log(
            chalk.red('Proxy error:') +
                ' Could not proxy request ' +
                chalk.cyan(req.url) +
                ' from ' +
                chalk.cyan(host) +
                ' to ' +
                chalk.cyan(proxy) +
                '.'
        )
        console.log(
            'See https://nodejs.org/api/errors.html#errors_common_system_errors for more information (' +
                chalk.cyan(err.code) +
                ').'
        )
        console.log()

        // 立即向客户端发送正确的错误响应。否则，在客户端的请求最终将超时(ERR_EMPTY_RESPONSE)
        if (res.writeHead && !res.headersSent) {
            res.writeHead(500)
        }
        res.end(
            'Proxy error: Could not proxy request ' +
            req.url +
            ' from ' +
            host +
            ' to ' +
            proxy +
            ' (' +
            err.code +
            ').'
        )
    }
}