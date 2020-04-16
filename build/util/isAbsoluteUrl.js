
// 判断是否为绝对路径
module.exports = function isAbsoluteUrl (url) {
  // 如果 URL 以 "<scheme>://" 或 "//" 开头，则认为是绝对路径
  return /^([a-z][a-z\d\+\-\.]*:)?\/\//i.test(url)
}
