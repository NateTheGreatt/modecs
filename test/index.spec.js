/* eslint-env jest */
const ModECS = require('../index')

describe('ModECS', () => {

    let engine

    beforeEach(() => {
        engine = ModECS()
        engine.registerComponent('POSITION', {x:0,y:0})
    })

    it('should not create a component before compilation', () => {
        expect(() => engine.createComponent('POSITION')).toThrow()
    })

    it('should create a component after compilation', () => {
        engine.compile()
        expect(() => engine.createComponent('POSITION')).not.toThrow()
    })

    it('should create a component with values', () => {        
        engine.compile()

        const position = engine.createComponent('POSITION', {x:2,y:2})

        expect(position.x).toEqual(2)
        expect(position.y).toEqual(2)
    })

    it('should create an entity', () => {
        const entity = engine.createEntity()
        expect(entity.componentTypes).toHaveLength(0)
    })

    it('should create an entity specified with components', () => {
        const entity = engine.createEntity('POSITION')
        expect(entity.componentTypes[0]).toEqual('POSITION')
    })

    it('should not add registered component to an entity before compilation', () => {
        const entity = engine.createEntity()
        expect(() => engine.addComponent(entity, 'POSITION')).toThrow()
    })

    it('should add registered component to an entity after compilation', () => {
        engine.compile()

        const entity = engine.createEntity()
        expect(() => engine.addComponent(entity, 'POSITION')).not.toThrow()
    })
})