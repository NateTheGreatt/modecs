
const DEBUG = false

export const log = (...args) => { if(DEBUG) console.log(...args) }

export const completeAssign = (target, ...sources) => {
    sources.forEach(source => {
      let descriptors = Object.keys(source).reduce((descriptors, key) => {
        descriptors[key] = Object.getOwnPropertyDescriptor(source, key);
        return descriptors;
      }, {});
      // by default, Object.assign copies enumerable Symbols too
    //   Object.getOwnPropertySymbols(source).forEach(sym => {
    //     let descriptor = Object.getOwnPropertyDescriptor(source, sym);
    //     if (descriptor.enumerable) {
    //       descriptors[sym] = descriptor;
    //     }
    //   });
      Object.defineProperties(target, descriptors);
    });
    return target;
}

export const shiftDelete = (array, i) => {
    let stop = array.length - 1
    while(i < stop) array[i] = array[++i]
    array.pop()
}

export const hrtimeMs = () => {
    let time = process.hrtime()
    return time[0] * 1000 + time[1] / 1000000
}

export const isServer = 
    typeof process !== 'undefined' &&
    process.versions != null &&
    process.versions.node != null;
    
export const isClient =
    typeof window !== 'undefined' && 
    typeof window.document !== 'undefined'

export const weakCache = (fn) => {
    const cache = new WeakMap()
    return (arg) => {

        if (cache.has(arg))
            return cache.get(arg)

        const computed = fn(arg)
        cache.set(arg, computed)

        return computed
    }
}

export const isInt = n => Number(n) === n && n % 1 === 0
export const isFloat = n => Number(n) === n && n % 1 !== 0

export const isWithin = (low, n, high) => low < n && n < high

export const FastArray = (size) => {
    const array = new Array(size).fill()
    let length = 0
    return Object.assign(array, {
        push: x => {array[length++] = x},
        pop: () => array[length--],
        unshift: x => {
            let i = length
            while (i) { array[i] = array[i-1]; i-- }
            array[0] = x
        },
        splice: index => {
            let i = length
            if (!i) return
            while (index < i) { array[index] = array[index+1]; index++ }
            length--
        },
        indexOf: x => {
            for (let i=0; i != length; i++) {
                if (array[i] === x) return i
            }
            return -1
        }
    })
}
