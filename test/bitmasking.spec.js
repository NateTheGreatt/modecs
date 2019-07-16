const bit = require('../src/bitmasking')

it('should return true', () => {
    x = 0b0101
    y = 0b0100
    expect(bit.has(x, y)).toBeTruthy()
})

it('should return value of flag', () => {
    x = 0b0
    y = 0b0100
    expect(bit.set(x, y)).toEqual(0b0100)
})

it('should not return a value', () => {
    x = 0b0
    y = 0b0100
    expect(bit.clear(x, y)).toEqual(0b0)
})

it('should return value of flag', () => {
    x = 0b0
    y = 0b0100
    expect(bit.toggle(x,y)).toEqual(0b0100)
})

it('should return value of mask', () => {
    x = 0b0101
    y = 0b0
    expect(bit.toggle(x, y)).toEqual(0b0101)
})

it('should return false', () => {
    x = 0b0101
    y = 0b0101
    expect(bit.toggle(x, y)).toBeFalsy()
})

it('should return false', () => {
    x = 0b0
    y = 0b0100
    expect(bit.check(x, y)).toBeFalsy()
})

it('should return true', () => {
    x = 0b0100
    y = 0b0
    expect(bit.check(x, y)).toBeTruthy()
})

it('should return true', () => {
    x = 0b0
    y = 0b0
    expect(bit.check(x, y)).toBeTruthy()
})