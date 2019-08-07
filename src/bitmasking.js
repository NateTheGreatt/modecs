module.exports = {
    has: (mask, flag) => mask.and(flag).equals(flag),
    set: (mask, flag) => mask.set(flag),
    clear: (mask, flag) => mask.clear(flag),
    toggle: (mask, flag) => mask.flip(flag),
    check: (mask, mask2) => mask.or(mask2).equals(mask)
}