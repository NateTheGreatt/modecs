const has = (mask, flag) => (mask & flag) === flag
const set = (mask, flag) => mask | flag
const clear = (mask, flag) => mask & ~flag
const toggle = (mask, flag) => mask ^ flag
const check = (mask, mask2) => mask === (mask | mask2)


module.exports = {
  has,
  set,
  clear,
  toggle,
  check,
}