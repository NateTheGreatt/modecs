/* eslint-env jest */
const Modecs = require('../index')


describe('Modecs', () => {
    const engine = Modecs()

    it('should register a component', () => {
        engine.registerComponent('POSITION', {x:0,y:0})
        expect(engine.components).toContain('POSITION')
    })
})