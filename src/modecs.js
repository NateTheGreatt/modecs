const EventEmitter = require('eventemitter3')
const bit = require('./bitmasking')
const {
    shiftDelete,
    hrtimeMs,
    isServer,
    isClient
} = require('./utils')

/**
 * Creates an new instance of the Modecs engine (no need to invoke with 'new')
 * @param {object} options to pass into the engine
 * @returns {object} a new engine
 */
module.exports = ({ tickRate = 20, idName = '__parentID' } = {}) => {

    const engine = new EventEmitter()

    // CONSTANTS //

    const TICK_RATE = tickRate
    const ID_PROPERTY = idName

    // ARRAYS & HASHMAPS // 
    
    // entity IDs are the index
    const entities = []
    
    // entity[ID_PROPERTY_NAME] => bitmask
    const entityId_bitmask = {}
    
    const bitmask_entityIds = {}

    
    const component_store = {} // arrays of component instances per type
    const component_shape = {} // shapes per type
    const component_bitflag = {} // component name to bitflag
    const bitflags = [] // array of bitflags
    const component_entityId = {}

    const views = []
    const systems = []

    // UTILS //

    const createBitmask = (...componentTypes) => componentTypes.reduce((mask, type) => mask | component_bitflag[type], 0)

    const typesFromMask = bitmask => Object.keys(component_bitflag).filter(type => bit.has(bitmask, component_bitflag[type]))

    // ENTITIES //
    let id = 0
    const createEntity = (...componentTypes) => {
        engine.emit('entity-created', id)
        return id++
    }
    
    /**
     * Add an entity to the engine
     * @param {object} id to add to the engine
     */
    const addEntity = id => {
        if(id === undefined)
            throw `Entity ID is undefined`

        entities[id] = id

        engine.emit('entity-added', id)
    }

    /**
     * Remove an entity from the engine
     * @param {object} entity to remove from the engine
     */
    const removeEntityDeferrals = []
    const removeEntity = (id, now=false) => {
        removeEntityDeferrals.push(() => {
            if(id === undefined)
                throw `Entity ID is undefined`

            engine.emit('entity-removed::before', id)
            
            typesFromMask(entityId_bitmask[id])
                .forEach(type => {
                    removeComponent(id, type, now)
                })

            const removedEntity = entities[id]
            
            delete entities[id]

            engine.emit('entity-removed', removedEntity)
        })

        if(now) removeEntityDeferrals.shift()()
    }
    
    // COMPONENTS //
    
    let bitflag = 1
    let componentCount = 0
    const registerComponentDeferrals = []
    /**
     * Registers a new type of component with the engine
     * @param {string} type of the component
     * @param {object} shape of the component
     */
    const registerComponent = (type, shape) => {
        // registerComponentDeferrals.push(() => {
            // re-registration
            if(component_store.hasOwnProperty(type)) {
                const shapeKeys = Object.keys(shape)

                // update each existing component with the new shape
                component_store[type].forEach(component => {
                    const cKeys = Object.keys(component)
                    // only apply new properties to the existing component (composite)
                    const newKeys = shapeKeys.filter(key => !cKeys.includes(key))
                    newKeys.forEach(key => { component[key] = shape[key] })
                })

                component_shape[type] = shape

            } else {

                componentCount++
                component_store[type] = []
                component_shape[type] = shape
                component_entityId[type] = []

                component_bitflag[type] = bitflag
                bitflags.push(bitflag)

                bitflag = 1 << componentCount // shift the bitflag by an offset of N components for next call
            }

            engine.emit('component-registered', type, shape, bitflag)
        // })
    }

    const shapeWithValues = (shape, values={}) => Object.keys(shape)
        .reduce((acc,key) => {
            acc[key] = values.hasOwnProperty(key) ? values[key] : shape[key] 
            return acc
        }, {})
        
    /**
     * Create a new component
     * @param {string} type of component to create
     * @param {object} [values={}] values to instantiate the component with
     * @returns {object} a new component
     */
    const createComponent = (type, values={}) => {
        const shape = component_shape[type]

        if(shape == undefined)
            throw `Tried to create an unregistered component type '${type}'`
        
        const component = shapeWithValues(shape, values)
        
        component.name = type
        component.type = type

        engine.emit('component-created', component)

        return component
    }

    /**
     * Add a component to an entity
     * @param {object} id to add the component to
     * @param {object} component to add to the entity
     * @param {object} values to instantiate the component with
     */
    const addComponent = (id, type, values={}) => {
        if(id == undefined)
            throw `Attempted to add a component to a non-existent entity.`
        if(!component_bitflag.hasOwnProperty(type)) 
            throw `Tried to add an unregistered component type '${type}'`

        const flag = component_bitflag[type]

        // if it already has the component, set values (if any) and return
        if(bit.has(entityId_bitmask[id], flag)) {
            return updateComponent(id, type, values)
        }

        const component = createComponent(type, values)
        
        component[ID_PROPERTY] = id

        entityId_bitmask[id] = bit.set(entityId_bitmask[id], flag)

        if(component_store[type] == undefined)
            throw `Component type '${type}' is not registered.`

        component_store[type].push(component)

        views.forEach(view => {
            // if entity matches with view
            if(bit.check(entityId_bitmask[id], view.bitmask)) {
                // add entity to view and let view get components
                view.add(id)
            }
        })

        component_entityId[type][id] = component

        engine.emit('component-added', component, id)
        
        return component
    }

    /**
     * Remove a component from an entity
     * @param {number} entityId to remove the component from
     * @param {string} type of component to remove from the entity
     */
    const removeComponentDeferrals = []
    const removeComponent = (id, type, now=false) => {
        removeComponentDeferrals.push(() => {

            const index = component_store[type].findIndex(c => c[ID_PROPERTY] == id)
            const component = shiftDelete(component_store[type], index)
            if(!component) {
                throw `Component type ${type} does not exist on entity${id}`
            }

            const flag = component_bitflag[type]

            // remove entity's component references from each relevant system
            views.forEach(view => {
                // if entity matches with view
                if(bit.check(entityId_bitmask[id], view.bitmask)) {
                    // remove entity from view
                    view.remove(id)
                }
            })
            
            delete component_entityId[type][id]

            // clear the bitflag and index on the entity
            entityId_bitmask[id] = bit.clear(entityId_bitmask[id], flag)

            engine.emit('component-removed', component, id)
        })

        if(now) removeComponentDeferrals.shift()()
    }
    
    /**
     * 
     * @param {number} id to get the component from
     * @param {string} type of component to get
     * @returns {object} a component
     */
    const getComponent = (id, type) => {
        return component_entityId[type][id]
    }

    /**
     * 
     * @param {number} id to update
     * @param {string} type of component to update
     * @param {object} values to update on the component
     */
    const updateComponent = (id, type, values) => {
        return Object.assign(
            component_entityId[type][id], 
            shapeWithValues(component_shape[type], values)
        )
    }

    
    // VIEWS //

    const entityBitmaskComponentFilter = (queryMask) => (component) => {
        const entityMask = entityId_bitmask[component[ID_PROPERTY]]
        return bit.check(entityMask, queryMask)
    }


    const query = (...componentTypes) => {
        const queryMask = createBitmask(...componentTypes)
        return componentTypes.reduce((acc,type) => {
            if(!component_store.hasOwnProperty(type))
                throw `'${type}' is not a registered component type`
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
        
        const existingView = views.find(view => bit.check(view.mask, bitmask))
        if(existingView) {
            return existingView
        }

        const cache = query(...componentTypes)

        const localEntities = cache[componentTypes[0]].map(c => c[ID_PROPERTY])
        
        const view = {
            bitmask,
            entities: localEntities,
            add: (id, swap=false) => {
                localEntities.push(id)
                
                componentTypes.forEach(type => {
                    cache[type].push(component_store[type].find(c => c[ID_PROPERTY] == id))
                })
            },
            remove: id => {
                // index to remove should be the same for entity and each component
                const i = localEntities.findIndex(id2 => id == id2)

                if(i == undefined) return
                
                shiftDelete(localEntities, i)
                
                componentTypes.forEach(type => {
                    shiftDelete(cache[type], i)
                })
            },
            // sort global arrays with this bitmask grouped together at the beginning of the array
            // should prioritize views with the most entities (group components at the beginning of their arrays by this bitmask)
            prioritize: () => {
                componentTypes.forEach(type => {
                    component_store[type].sort((a,b) => {
                        const maskA = entityId_bitmask[a]
                        return bit.check(maskA, bitmask)
                    })
                })
            }
        }

        Object.assign(view, cache)

        views.push(view)

        return view
    }


    // SYSTEMS //

    /**
     * 
     * @param {string} name of the system
     * @param {string[]} componentTypes that the system requires an entity to have
     * @param {function} setup function to call when the engine starts
     * @param {number} frequency of the system in millihertz (invoked every N milliseconds)
     * @param {boolean} [swap=true] BUGGED swap components into a local memory space (tends to increase performance)
     */
    const registerSystemDeferrals = []
    const registerSystem = (name, componentTypes, setup, frequency, swap=false) => {
        // registerSystemDeferrals.push(() => {
            const updateFn = setup()
            const arity = componentTypes.length

            const view = createView(...componentTypes)

            const parameters = componentTypes.map(type => view[type])
            
            let update

                if(arity==1) update = (i, id)=> updateFn(parameters[0][i], id)
            else if(arity==2) update = (i, id)=> updateFn(parameters[0][i], parameters[1][i], id)
            else if(arity==3) update = (i, id)=> updateFn(parameters[0][i], parameters[1][i], parameters[2][i], id)
            else if(arity==4) update = (i, id)=> updateFn(parameters[0][i], parameters[1][i], parameters[2][i], parameters[3][i], id)
            else if(arity==5) update = (i, id)=> updateFn(parameters[0][i], parameters[1][i], parameters[2][i], parameters[3][i], parameters[4][i], id)
            else if(arity==6) update = (i, id)=> updateFn(parameters[0][i], parameters[1][i], parameters[2][i], parameters[3][i], parameters[4][i], parameters[5][i], id)

            let frequencyCounter = frequency
            const system = {
                name,
                componentTypes,
                bitmask: view.bitmask,
                entities: view.entities,
                prioritize: view.prioritize,
                add: entity => {
                    view.add(entity, swap)
                },
                remove: entity => {
                    view.remove(entity)
                },
                process: () => {
                    // frequencyCounter -= engine.time.delta
                    // process system logic
                    for(let i = 0; i < view.entities.length; i++) {
                        update(i, view.entities[i])
                    }
                }
            }

            const existingIndex = systems.findIndex(s => s.name == name)
            if(existingIndex !== -1) systems[existingIndex] = system
            else systems.push(system)
            
            systems[name.toLowerCase()] = system

            engine.emit('system-registered', system)

            return system
        // })
    }

    const registrationDeferrals = () => {
        while(registerComponentDeferrals.length > 0)
            registerComponentDeferrals.shift()()
        while(registerSystemDeferrals.length > 0)
            registerSystemDeferrals.shift()()
    }

    const removalDeferrals = () => {
        while(removeComponentDeferrals.length > 0)
            removeComponentDeferrals.shift()()
        while(removeEntityDeferrals.length > 0)
            removeEntityDeferrals.shift()()
    }


    // GAME LOOP //

    engine.process = () => {
        for(let i = 0; i < systems.length; i++) {
            systems[i].process()
            removalDeferrals()
        }
    }

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
        
        engine.process()

        engine.emit('update', time.delta, time.tick)

        // registrationDeferrals()

        previous = time.now
        time.tick++
    }

    Object.assign(engine, {
        ID_PROPERTY,
        createView,
        registerSystem,
        registerComponent,
        createEntity,
        addEntity,
        removeEntity,
        createComponent,
        addComponent,
        removeComponent,
        getComponent,
        updateComponent
    })

    // references
    engine.time = time

    engine.compile = () => {
        // registrationDeferrals()
    }
    
    /**
     * Start the engine
     */
    engine.start = fn => {
        engine.compile()
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