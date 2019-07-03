const EventEmitter = require('eventemitter3')
const bit = require('./bitmasking')
const {
    shiftDelete,
    hrtimeMs,
    isServer,
    isClient
} = require('./utils')

const ID_PROPERTY_NAME = 'fid'

export default ({ tickRate = 20 } = {}) => {

    const engine = new EventEmitter()

    // CONSTANTS //

    const TICK_RATE = tickRate

    // ARRAYS & HASHMAPS // 
    
    // entity IDs are the index
    const entities = []
    
    // entity.id => ______
    const entityId_bitmask = {}
    
    const bitmask_entityIds = {}

    
    const component_store = {} // arrays of component instances per type
    const component_shape = {} // shapes per type
    const component_bitflag = {} // bitflags per type
    const component_entityId = {}

    // store references to each system in the array
    const systems = []
    

    // ENTITIES //

    const createEntity = (...componentTypes) => {
        const entity = { componentTypes, componentIndices: {...componentTypes}, bitmask: 0 }
        engine.emit('entity-created', entity)
        return entity
    }
    
    const addEntity = entity => {
        if(!entity.hasOwnProperty('id')) entity.id = Object.keys(entities).length

        entities[entity.id] = entity

        entity.componentTypes
            .forEach(componentName => {
                addComponent(entity, componentName)
            })

        engine.emit('entity-added', entity)
    }

    const removeEntity = entity => {

        engine.emit('entity-removed::before', entity)

        entity.componentTypes
            .forEach(componentName => {
                removeComponent(entity.id, componentName)
            })

        const removedEntity = entities[entity.id]
        
        delete entities[entity.id]

        engine.emit('entity-removed', removedEntity)
    }
    
    const getEntity = id => {
        return entities[id]
    }

    // COMPONENTS //
    
    let bitflag = 1
    let componentCount = 0
    const registerComponentCalls = []
    const registerComponent = (name, shape) => registerComponentCalls.push(() => {
        componentCount++
        component_store[name] = []
        component_shape[name] = shape
        component_entityId[name] = []

        component_bitflag[name] = bitflag
        bitflag = 1 << componentCount // shift the bitflag by an offset of N components

        engine.emit('component-registered', name, shape, bitflag)
    })

    const shapeWithValues = (shape, values={}) => Object.keys(shape)
            .reduce((acc,key) => Object.assign(acc, { [key]: values[key] || shape[key] }), {})

    const createComponent = (name, values={}) => {
        const shape = component_shape[name]
        
        const component = shapeWithValues(shape, values)
        
        component.name = name
        component.type = name

        engine.emit('component-created', component)

        return component
    }

    const addComponent = (entity, component, values={}) => {
        let type
        if(typeof component === 'string') type = component
        if(typeof component === 'object') type = component.name

        if(!component_bitflag.hasOwnProperty(type)) {
            console.warn(`Fir Warning: Tried to add an unregistered component type '${type}'`)
            return
        }

        const flag = component_bitflag[type]
        
        // entity = entityId
        if(typeof entity !== 'object') entity = entities[entity]

        // if it already has the component, set values (if any) and return
        if(bit.has(entity.bitmask, flag)) {
            return updateComponent(entity.id, type, values)
        }

        if(typeof component === 'string') component = createComponent(component, values)
        
        component.id = entity.id

        entity.bitmask = bit.set(entity.bitmask, flag)

        entityId_bitmask[entity.id] = entity.bitmask

        const store = component_store[type]

        store.push(component)


        // entity.componentIndices[type] = storeIndex
        entity.componentTypes.push(type)

        systems
            // only relevant systems
            .filter(system => bit.has(system.bitmask, flag))
            .forEach(system => {
                // if entity matches with system
                if(bit.check(entity.bitmask, system.bitmask)) {
                    // add entity to system and let system get components
                    system.add(entity)
                }
            })

        component_entityId[type][entity.id] = component

        engine.emit('component-added', component, entity)
        
        return component
    }

    const removeComponent = (entityId, componentName) => {

        const entity = entities[entityId]

        const component = component_store[componentName].find(c => c.id == entityId)
        if(!component) {
            console.warn(`attempted to remove component type ${componentName} that doesn't exist on entity${entityId}`)
            return
        }

        const flag = component_bitflag[componentName]

        // remove entity's component references from each relevant system
        systems
            // only relevant systems
            .filter(system => bit.has(system.bitmask, flag))
            .forEach(system => {
                // if entity matches with system
                if(bit.check(entity.bitmask, system.bitmask)) {
                    // remove entity from system
                    system.remove(entity)
                }
            })
        
        delete component_entityId[componentName][entityId]

        // clear the bitflag and index on the entity
        entity.bitmask = bit.clear(entity.bitmask, flag)
        
        engine.emit('component-removed', component, entity)
    }
    
    const getComponent = (entityId, type) => {
        if(typeof entityId === 'object') entityId = entityId.id
        return component_entityId[type][entityId]
    }

    const updateComponent = (entityId, type, values) => {
        if(typeof entityId === 'object') entityId = entityId.id
        return Object.assign(
            component_entityId[type][entityId], 
            shapeWithValues(component_shape[type], values)
        )
    }

    
    // VIEWS //

    // once filtered, new entities with this bitmask state can have their components tacked onto the beginning of the local arrays
    const entityBitmaskComponentFilter = (queryMask) => (component) => {
        const entityMask = entityId_bitmask[component.id]
        return bit.check(entityMask, queryMask)
    }

    const createBitmask = (...componentTypes) => componentTypes.reduce((mask, type) => mask | component_bitflag[type], 0)

    const query = (...componentTypes) => {
        const queryMask = createBitmask(...componentTypes)
        return componentTypes.reduce((acc,type) => 
            Object.assign(acc, { [type]: component_store[type].filter(entityBitmaskComponentFilter(queryMask)) }), {})
    }

    const createView = (...componentTypes) => {
        const bitmask = createBitmask(...componentTypes)
        const cache = query(...componentTypes)

        const entityId_localIndex = {}

        const localEntities = cache[componentTypes[0]].map(c => c.id)

        return {
            cache,
            bitmask,
            entities: localEntities,
            add: (entity, copy=true) => {
                localEntities.push(entity.id)
                
                // cache the index of new entity (entity + components will have the same index within the local cache arrays)
                entityId_localIndex[entity.id] = localEntities.length - 1

                componentTypes.forEach(type => {
                    const componentIndex = component_store[type].findIndex(c => c.id == entity.id)
                    const component = component_store[type][componentIndex]
                    const cacheType = cache[type]
                    if(copy) { // tends to speed things up
                        const copiedComponent = completeAssign({}, component)
                        cacheType.push(copiedComponent)
                        component_store[type][componentIndex] = cacheType[cacheType.length-1]
                    } else {
                        cacheType.push(component)
                    }
                })
            },
            remove: entity => {
                // index to remove should be the same for entity and each component
                let i = entityId_localIndex[entity.id]

                if(i == undefined) return
                
                shiftDelete(localEntities, i)
                
                componentTypes.forEach(type => {
                    shiftDelete(cache[type], i)
                })
                
                delete entityId_localIndex[entity.id]
            },
            // sort global arrays with this bitmask grouped together at the beginning of the array
            // should prioritize views with the most entities (group components at the beginning of their arrays by this bitmask)
            prioritize: () => {
                componentTypes.forEach(type => {
                    component_store[type].sort((a,b) => {
                        const maskA = entityId_bitmask[a.id]
                        return bit.check(maskA, bitmask)
                    })
                })
            }
        }
    }


    // SYSTEMS //

    const registerSystemCalls = []
    const registerSystem = (name, componentTypes, setup, copy=true) => registerSystemCalls.push(() => {
        const updateFn = setup()
        const arity = componentTypes.length

        const view = createView(...componentTypes)

        const parameters = componentTypes.map(type => view.cache[type])
        
        let update

             if(arity==1) update = i => updateFn(parameters[0][i])
        else if(arity==2) update = i => updateFn(parameters[0][i], parameters[1][i])
        else if(arity==3) update = i => updateFn(parameters[0][i], parameters[1][i], parameters[2][i])
        else if(arity==4) update = i => updateFn(parameters[0][i], parameters[1][i], parameters[2][i], parameters[3][i])
        else if(arity==5) update = i => updateFn(parameters[0][i], parameters[1][i], parameters[2][i], parameters[3][i], parameters[4][i])
        else if(arity==6) update = i => updateFn(parameters[0][i], parameters[1][i], parameters[2][i], parameters[3][i], parameters[4][i], parameters[5][i])

        const system = {
            name,
            componentTypes,
            bitmask: view.bitmask,
            entities: view.entities,
            prioritize: view.prioritize,
            add: entity => {
                view.add(entity, copy)
            },
            remove: entity => {
                view.remove(entity)
            },
            process: () => {
                // process system logic
                for(let i = 0; i < view.entities.length; i++) {
                    update(i)
                }
            }
        }

        systems.push(system)
        systems[name.toLowerCase()] = system

        engine.emit('system-registered', system)

        return system
    })

    const compileNewRegistrations = () => {
        while(registerComponentCalls.length > 0)
            registerComponentCalls.shift()()
        while(registerSystemCalls.length > 0)
            registerSystemCalls.shift()()
    }


    // GAME LOOP //

    const time = {
        tick: 0,
        delta: 0
    }

    let previous = time.now = isClient ? performance.now() : hrtimeMs()
    
    const tickLengthMs = 1000 / TICK_RATE
    const loop = () => {
        if(isServer) setTimeout(loop, tickLengthMs)
        if(isClient) window.requestAnimationFrame(loop)
        time.now = isClient ? performance.now() : hrtimeMs()
        time.delta = (time.now - previous) / 1000
        
        for(let i = 0; i < systems.length; i++)
            systems[i].process()

        engine.emit('update', time.delta, time.tick)

        compileNewRegistrations()

        previous = time.now
        time.tick++
    }

    
    Object.assign(engine, {
        ID_PROPERTY_NAME,
        createView,
        registerSystem,
        registerComponent,
        createEntity,
        addEntity,
        removeEntity,
        getEntity,
        createComponent,
        addComponent,
        removeComponent,
        getComponent,
        updateComponent
    })

    // references
    engine.time = time

    engine.init = () => {
        compileNewRegistrations()
    }
    
    engine.start = fn => {
        engine.init()
        engine.emit('start')
        loop()
    }

    engine.use = fn => {
        fn(engine)
    }

    return engine
}