export const has = (mask, flag) => (mask & flag) === flag
export const set = (mask, flag) => mask | flag
export const clear = (mask, flag) => mask & ~flag
export const toggle = (mask, flag) => mask ^ flag
export const check = (mask, mask2) => mask === (mask | mask2)
