

const Service = require('../Service')
const service = new Service(process.cwd())

/*
  [ 
    'D:\\nodejs\\node.exe',
    'C:\\Users\\xxx\\Desktop\\project\\webpack-test\\build\\bin\\index.js',
    'serve',
    '--open=true',
    './src/app/index.html' 
  ]
*/
const rawArgv = process.argv.slice(2)
// https://cli.vuejs.org/zh/guide/cli-service.html#vue-cli-service-serve
// 命令行参数解析引擎
// { _: [ 'serve', './src/app/index.html' ], open: true, copy: false, https: false, verbose: false }
const args = require('minimist')(rawArgv, {
    boolean: [
      // build
      'modern',
      'report',
      'report-json',
      'inline-vue',
      'watch',
      // serve
      'open',
      'copy',
      'https',
      // inspect
      'verbose'
    ]
})
// console.log(args)
const command = args._[0]

service.run(command, args, rawArgv).catch(err => {
    console.error(err)
    process.exit(1)
})