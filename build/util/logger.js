
const chalk = require('chalk')
const stripAnsi = require('strip-ansi') // 从字符串中删除 ANSI 转义代码
// stripAnsi('\u001B[4mUnicorn\u001B[0m') => 'Unicorn'


const format = (label, msg) => {
    return msg.split('\n').map((line, i) => {
      return i === 0
        ? `${label} ${line}`
        : line.padStart(stripAnsi(label).length, '')
    }).join('\n')
}

const chalkTag = msg => chalk.bgBlackBright.white.dim(` ${msg} `)

// 控制台输出日志信息方法
exports.log = (msg = '', tag = null) => {
    tag ? console.log(format(chalkTag(tag), msg)) : console.log(msg)
}

exports.info = (msg, tag = null) => {
    console.log(format(chalk.bgBlue.black(' INFO ') + (tag ? chalkTag(tag) : ''), msg))
}

exports.done = (msg, tag = null) => {
    console.log(format(chalk.bgGreen.black(' DONE ') + (tag ? chalkTag(tag) : ''), msg))
}
  
exports.warn = (msg, tag = null) => {
    console.warn(format(chalk.bgYellow.black(' WARN ') + (tag ? chalkTag(tag) : ''), chalk.yellow(msg)))
}
  
exports.error = (msg, tag = null) => {
    console.error(format(chalk.bgRed(' ERROR ') + (tag ? chalkTag(tag) : ''), chalk.red(msg)))
    if (msg instanceof Error) {
        console.error(msg.stack)
    }
}

