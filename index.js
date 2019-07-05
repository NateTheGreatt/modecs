const EventEmitter = require('eventemitter3')
const bit = require('./bitmasking')
const {
    shiftDelete,
    hrtimeMs,
    isServer,
    isClient
} = require('./utils')

const ID_PROPERTY_NAME = 'fid'

/**
 * Creates an new instance of the Fir engine (no need to invoke with 'new')
 * @param {object} options to pass into the engine
 * @returns {object} a new engine
 */
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

    /**
     * Creates a new entity
     * @param  {...string} componentTypes to add to the entity
     * @returns {object} a new entity
     */
    const createEntity = (...componentTypes) => {
        const entity = { componentTypes, componentIndices: {...componentTypes}, bitmask: 0 }
        engine.emit('entity-created', entity)
        return entity
    }
    
    /**
     * Add an entity to the engine
     * @param {object} entity to add to the engine
     */
    const addEntity = entity => {
        if(entity === undefined)
            throw new Error('Fir Error: Entity is undefined')

        if(!entity.hasOwnProperty('id')) entity.id = Object.keys(entities).length

        entities[entity.id] = entity

        entity.componentTypes
            .forEach(componentType => {
                addComponent(entity, componentType)
            })

        engine.emit('entity-added', entity)
    }

    /**
     * Remove an entity from the engine
     * @param {object} entity to remove from the engine
     */
    const removeEntity = entity => {
        if(entity === undefined)
            throw new Error('Fir Error: Entity is undefined')

        engine.emit('entity-removed::before', entity)

        entity.componentTypes
            .forEach(componentType => {
                removeComponent(entity.id, componentType)
            })

        const removedEntity = entities[entity.id]
        
        delete entities[entity.id]

        engine.emit('entity-removed', removedEntity)
    }
    
    /**
     * Get an existing entity from the engine
     * @param {number} id of the entity to get
     */
    const getEntity = id => {
        return entities[id]
    }

    // COMPONENTS //
    
    let bitflag = 1
    let componentCount = 0
    const registerComponentCalls = []
    /**
     * Registers a new type of component with the engine
     * @param {string} type of the component
     * @param {object} shape of the component
     */
    const registerComponent = (type, shape) => registerComponentCalls.push(() => {
        componentCount++
        component_store[type] = []
        component_shape[type] = shape
        component_entityId[type] = []

        component_bitflag[type] = bitflag
        bitflag = 1 << componentCount // shift the bitflag by an offset of N components

        engine.emit('component-registered', type, shape, bitflag)
    })

    const shapeWithValues = (shape, values={}) => Object.keys(shape)
            .reduce((acc,key) => Object.assign(acc, { [key]: values[key] || shape[key] }), {})

    /**
     * Create a new component
     * @param {string} type of component to create
     * @param {object} [values={}] values to instantiate the component with
     * @returns {object} a new component
     */
    const createComponent = (type, values={}) => {
        const shape = component_shape[type]
        
        const component = shapeWithValues(shape, values)
        
        component.name = type
        component.type = type

        engine.emit('component-created', component)

        return component
    }

    /**
     * Add a component to an entity
     * @param {object} entity to add the component to
     * @param {object} component to add to the entity
     * @param {object} values to instantiate the component with
     */
    /**
     * Add a component to an entity
     * @param {number} entity.id to add the component to
     * @param {string} component.type to add to the entity
     * @param {object} values to instantiate the component with
     */
    const addComponent = (entity, component, values={}) => {
        let type
        if(typeof component === 'string') type = component
        if(typeof component === 'object') type = component.type

        if(!component_bitflag.hasOwnProperty(type)) 
            throw new Error(`Fir Error: Tried to add an unregistered component type '${type}'`)

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

        systems.forEach(system => {
            // system must have component type
            if(!bit.has(system.bitmask, flag)) return

            // entity must match with system
            if(!bit.check(entity.bitmask, system.bitmask)) return

            // add entity to system and let system get components
            system.add(entity)
        })

        component_entityId[type][entity.id] = component

        engine.emit('component-added', component, entity)
        
        return component
    }

    /**
     * Remove a component from an entity
     * @param {number} entityId to remove the component from
     * @param {string} type of component to remove from the entity
     */
    const removeComponent = (entityId, type) => {

        const entity = entities[entityId]

        const component = component_store[type].find(c => c.id == entityId)
        if(!component) {
            throw new Error(`Fir Error: Component type ${type} does not exist on entity${entityId}`)
        }

        const flag = component_bitflag[type]

        // remove entity's component references from each relevant system
        systems.forEach(system => {
            // system must have component type
            if(!bit.has(system.bitmask, flag)) return

            // entity must match with system
            if(!bit.check(entity.bitmask, system.bitmask)) return

            // remove entity from system
            system.remove(entity)
        })
        
        delete component_entityId[type][entityId]

        // clear the bitflag and index on the entity
        entity.bitmask = bit.clear(entity.bitmask, flag)
        
        engine.emit('component-removed', component, entity)
    }
    
    /**
     * 
     * @param {number} entityId to get the component from
     * @param {string} type of component to get
     * @returns {object} a component
     */
    const getComponent = (entityId, type) => {
        if(typeof entityId === 'object') entityId = entityId.id
        return component_entityId[type][entityId]
    }

    /**
     * 
     * @param {number} entityId to update
     * @param {string} type of component to update
     * @param {object} values to update on the component
     */
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
        return componentTypes.reduce((acc,type) => {
            if(!component_store.hasOwnProperty(type))
                throw new Error(`Fir Error: '${type}' is not a registered component type`)
            return Object.assign(acc, { [type]: component_store[type].filter(entityBitmaskComponentFilter(queryMask)) });
        }, {})
    }

    /**
     * Creates a new view.
     * A view is a group of entities who have a certain set of components.
     * @param  {...string} componentTypes to create a view of
     */
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

                Object.keys(entityId_localIndex)
                    .forEach(entityId => {
                        entityId_localIndex[entityId] -= 1
                    })
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
    /**
     * 
     * @param {string} name of the system
     * @param {string[]} componentTypes that the system requires an entity to have
     * @param {function} setup function to call when the engine starts
     * @param {number} frequency of the system in millihertz (invoked every N milliseconds)
     * @param {boolean} [copy=true] copy components into a local memory space (tends to increase performance)
     */
    const registerSystem = (name, componentTypes, setup, frequency, copy=true) => registerSystemCalls.push(() => {
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

        let frequencyCounter = frequency
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
                // frequencyCounter -= engine.time.delta
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
    let frequencyCounter
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
        get components() { return Object.keys(component_shape) },
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
    
    /**
     * Start the engine
     */
    engine.start = fn => {
        engine.init()
        engine.emit('start')
        loop()
    }

    /**
     * Use a plugin
     */
    engine.use = fn => {
        fn(engine)
    }

    return engine
}