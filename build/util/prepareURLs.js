/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file at
 * https://github.com/facebookincubator/create-react-app/blob/master/LICENSE
 */

const url = require('url')
const chalk = require('chalk')
const address = require('address') // 获取当前计算机IP、MAC和DNS服务，DNS服务从 /etc/resolv.conf 接收
const defaultGateway = require('default-gateway') // 可跨平台的获取默认的网络网关

// 解析传入的协议、域名、端口，生成路径返回
module.exports = function prepareUrls (protocol, host, port, pathname = '/') {
    const formatUrl = hostname => // 将一个解析后的 URL对象、转成、一个格式化的 URL字符串
        url.format({ // 'http://127.0.0.1:8000/'
            protocol,
            hostname,
            port,
            pathname
        })

    const prettyPrintUrl = hostname => 
        url.format({
            protocol,
            hostname,
            port: chalk.bold(port),
            pathname
        })
    
    const isUnspecifiedHost = host === '0.0.0.0' || host === '::' // 是否为未指定的主机
    let prettyHost, lanUrlForConfig
    let lanUrlForTerminal = chalk.gray('unavailable')
    // 判断传入 host 是否为未指定的主机，
    // 是就设置 prettyHost 为 'localhost'
    // 否则设置 prettyHost 为 host
    if (isUnspecifiedHost) { // 为未指定的主机
        prettyHost = 'localhost'
        try {
            // 只返回 IPv4 地址
            const result = defaultGateway.v4.sync()
            lanUrlForConfig = address.ip(result && result.interface) // 获取 ip 地址
            if (lanUrlForConfig) {
                // 检查地址是否为私有ip
                // https://en.wikipedia.org/wiki/Private_network#Private_IPv4_address_spaces
                if (
                    /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(
                        lanUrlForConfig
                    )
                ) {
                    // 地址是私有的，格式化并为之后使用
                    lanUrlForTerminal = prettyPrintUrl(lanUrlForConfig)
                } else {
                    // 地址不是私有的，不使用它
                    lanUrlForConfig = undefined
                }
            }
        } catch (error) {
            // ignored
        }
    } else { // 不为未指定的主机
        prettyHost = host
        lanUrlForConfig = host
        lanUrlForTerminal = prettyPrintUrl(lanUrlForConfig)
    }

    const localUrlForTerminal = prettyPrintUrl(prettyHost)
    const localUrlForBrowser = formatUrl(prettyHost)

    // IP 地址: 10.4.125.61(通过插件获取的电脑 IP 地址)
    // host: 'localhost'、'127.0.0.1'(默认设置的或用户传入设置的)
    return {
        lanUrlForConfig, // IP 地址
        lanUrlForTerminal, // 完整地址，且 host 为获取的 IP 地址(prot 打印出有高亮色)
        localUrlForTerminal, // 完整地址，且 host 为 'localhost' 或 用户设置的值(prot 打印出有高亮色)
        localUrlForBrowser // 完整地址，且 host 为 'localhost' 或 用户设置的值
    }
}