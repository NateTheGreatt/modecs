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
module.exports = ({ 
    tickRate = 20, 
    idName = '__parentID',
    snapshot
} = {}) => {

    const engine = new EventEmitter()

    // CONSTANTS //

    const TICK_RATE = tickRate
    const ID_PROPERTY = idName

    // ARRAYS & HASHMAPS // 

    let data = {
        // entity IDs are the index
        entities: [],
        
        // entity[ID_PROPERTY_NAME] => bitmask
        entityId_bitmask: {},
        
        bitmask_entityIds: {},

        component_store: {}, // arrays of component instances per type,
        component_shape: {}, // shapes per type,
        component_bitflag: {}, // component name to bitflag,
        component_entityId: {},


        view_bitmask: {},
        view_entities: {},
        view_components: {},
        
        views: [],
        

        system_types: {},
        system_view: {},
        system_parameters: {},
        system_source: {},
        
        systems: []
    }

    let {
        entities,
        entityId_bitmask,
        
        component_store, // arrays of component instances per type,
        component_shape, // shapes per type,
        component_bitflag, // component name to bitflag,
        component_entityId,

        view_bitmask,
        view_entities,
        view_components,
        views,

        system_types,
        system_view,
        system_parameters,
        system_source,
        systems
    } = data


    // UTILS //

    const createBitmask = (...componentTypes) => componentTypes.reduce((mask, type) => mask | component_bitflag[type], 0)

    const typesFromMask = bitmask => Object.keys(component_bitflag).filter(type => bit.has(bitmask, component_bitflag[type]))

    // ENTITIES //
    let entityIdCount = 0
    const createEntity = () => {
        engine.emit('entity-created', entityIdCount)
        return entityIdCount++
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
    const entityRemovalQueue = []
    
    const _removeEntity = id => {
        const removedEntity = entities[id]
        
        delete entities[id]

        engine.emit('entity-removed', removedEntity)
    }

    const removeEntity = (id, now=false) => {
        if(id === undefined || entities[id] === undefined)
            throw `Entity ID is undefined`

        engine.emit('entity-removed::before', id)

        typesFromMask(entityId_bitmask[id])
            .forEach(type => {
                removeComponent(id, type, now)
            })

        if(now) _removeEntity(id)
        else entityRemovalQueue.push(() => _removeEntity(id))
    }
    
    // COMPONENTS //
    
    let bitflag = 1
    let componentCount = 0
    /**
     * Registers a new type of component with the engine
     * @param {string} type of the component
     * @param {object} shape of the component
     */
    const registerComponent = (type, shape) => {
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

            bitflag = 1 << componentCount // shift the bitflag by an offset of N components for next call
        }

        engine.emit('component-registered', type, shape, bitflag)
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
        if(entities[id] == undefined)
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

        views
            .filter(view => bit.has(view.bitmask, flag))
            .forEach(view => {
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
    const componentRemovalQueue = []

    const _removeComponent = (id, type) => {
        const index = component_store[type].findIndex(c => c[ID_PROPERTY] == id)
        const component = component_store[type][index]
        
        if(!component) {
            // throw `Component type ${type} does not exist on entity${id}`
            return
        }

        shiftDelete(component_store[type], index)

        const flag = component_bitflag[type]

        // remove entity's component references from each relevant system
        views
            .filter(view => bit.has(view.bitmask, flag))
            .forEach(view => {
                // if entity matches with view
                if(bit.has(view.bitmask, flag)) {
                    // remove entity from view
                    view.remove(id)
                }
            })
        
        delete component_entityId[type][id]

        // clear the bitflag and index on the entity
        entityId_bitmask[id] = bit.clear(entityId_bitmask[id], flag)

        engine.emit('component-removed', component, id)
    }

    const removeComponent = (id, type, now=false) => {
        if(id === undefined || entities[id] === undefined)
            throw `Entity ID is undefined`

        if(now) _removeComponent(id, type)
        componentRemovalQueue.push(() => _removeComponent(id, type))
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
            shapeWithValues(component_entityId[type][id], values)
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
    
    
    const createSignature = (...componentTypes) => componentTypes.sort().join('-')

    /**
     * Creates a new view.
     * A view is a group of entities who have a certain set of components.
     * @param  {...string} componentTypes to create a view of
     */
    const createView = (...componentTypes) => {

        const bitmask = createBitmask(...componentTypes)

        // existing view
        const existingView = views.find(view => bit.check(view.mask, bitmask))
        if(existingView) {
            return existingView
        }

        // new view
        const signature = createSignature(...componentTypes)
        view_bitmask[signature] = bitmask

        const cache = query(...componentTypes)
        view_components[signature] = cache

        const localEntities = cache[componentTypes[0]].map(c => c[ID_PROPERTY])
        view_entities[signature] = localEntities
        
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

                if(i === -1) return

                if(i === undefined) return
                
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
    const registerSystem = (name, componentTypes, setup, frequency, swap=false) => {
        // registerSystemDeferrals.push(() => {
            system_source[name] = setup.toString()
            system_types[name] = componentTypes
            
            const updateFn = setup()
            const arity = componentTypes.length > 64 ? 64 : componentTypes.length

            const view = createView(...componentTypes)
            system_view[name] = view

            const parameters = componentTypes.map(type => view[type])
            system_parameters[name] = parameters

            const args = componentTypes.map((t,i) => parameters[i])
            const update = (i, id) => updateFn(...args.map(arg => arg[i]), id)

            let frequencyCounter = frequency
            const system = {
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

    const takeSnapshot = () => JSON.stringify({
        data
    },null,2)

    // hydrate
    if(snapshot) {
        data = JSON.parse(snapshot)

        // populate systems (and thereby views as well)
        systems = Object.keys(system_source)
            .map(name => {
                eval(```
                    registerSystem(
                        ${name},
                        ${system_types[name]},
                        ${system_source[name]}
                    )
                ```)
            })

    }

    const removalDeferrals = () => {
        while(componentRemovalQueue.length > 0){
            componentRemovalQueue.shift()() // shift boobies
        }
        while(entityRemovalQueue.length > 0){
            entityRemovalQueue.shift()() // shift boobies
        }
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

        previous = time.now
        time.tick++
    }

    Object.assign(engine, {
        ID_PROPERTY,
        createView,
        registerSystem,
        registerComponent,
        compile: () => {},
        createEntity,
        addEntity,
        removeEntity,
        createComponent,
        addComponent,
        removeComponent,
        getComponent,
        updateComponent,
        snapshot: takeSnapshot
    })

    // references
    engine.time = time

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