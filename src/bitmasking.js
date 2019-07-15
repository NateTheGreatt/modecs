module.exports = {
    has: (mask, flag) => (mask & flag) === flag,
    set: (mask, flag) => mask | flag,
    clear: (mask, flag) => mask & ~flag,
    toggle: (mask, flag) => mask ^ flag,
    check: (mask, mask2) => mask === (mask | mask2)
}
