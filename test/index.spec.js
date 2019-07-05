/* eslint-env jest */
const Fir = require('../index')


describe('Fir', () => {
    const engine = Fir()

    it('should register a component', () => {
        engine.registerComponent('POSITION', {x:0,y:0})
        expect(engine.components).toContain('POSITION')
    })
})