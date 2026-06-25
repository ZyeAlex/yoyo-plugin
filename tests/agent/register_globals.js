/** 单元测试环境：云崽 global logger + segment 占位 */
global.logger = global.logger || {
  error: (...args) => console.error('[logger]', ...args),
  warn: (...args) => console.warn('[logger]', ...args),
  info: (...args) => console.info('[logger]', ...args),
  mark: (...args) => console.log('[logger]', ...args),
}

global.segment = global.segment || {
  image: (url) => ({ type: 'image', url }),
  at: (qq) => ({ type: 'at', qq }),
  face: (id) => ({ type: 'face', id }),
}
