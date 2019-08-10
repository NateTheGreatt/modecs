const EventEmitter = require('eventemitter3')
const {
    shiftDelete,
    hrtimeMs,
    isServer,
    isClient
} = require('./utils')

const bit = require('./bitmasking')
const BitSet = require('bitset')

/**
 * Data-Oriented variable naming schemes:
 * 
 * regularObject = {}
 * hash_map = {}
 * $_structure_of_arrays = {}
 */

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

    // allocate memory for all of the data in the engine
    let data = {
        // entity IDs are the index
        entities: [],
        
        // entity[ID_PROPERTY_NAME] => bitmask
        entityId_bitmask: {},
        
        $_component_store: {}, // arrays of component instances per component type (SoAoS)
        component_shape: {}, // shapes per type (hashmap)
        component_bitflag: {}, // component name to bitflag (hashmap)
        $_component_entityId: {}, // arrays of entity IDs per component type (SoA)

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

    // bring into local scope
    let {
        entities,
        entityId_bitmask,
        
        $_component_store,
        component_shape,
        component_bitflag,
        $_component_entityId,

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

    const createBitmask = (...componentTypes) => componentTypes.reduce((bitset, type) => bitset.set(component_bitflag[type]), new BitSet)

    const typesFromMask = bitmask => Object.keys(component_bitflag).filter(type => bitmask.get(component_bitflag[type]))

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
            throw new Error(`Entity ID is undefined`)

        entities[id] = id
        entityId_bitmask[id] = new BitSet

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
            throw new Error(`Entity ID is undefined`)

        engine.emit('entity-removed::before', id)

        typesFromMask(entityId_bitmask[id])
            .forEach(type => {
                removeComponent(id, type, now)
            })

        if(now) _removeEntity(id)
        else entityRemovalQueue.push(() => _removeEntity(id))
    }
    
    // COMPONENTS //
    
    let componentCount = 0
    /**
     * Registers a new type of component with the engine
     * @param {string} type of the component
     * @param {object} shape of the component
     */
    const registerComponent = (type, shape) => {
        // re-registration
        if($_component_store.hasOwnProperty(type)) {
            const shapeKeys = Object.keys(shape)

            // update each existing component with the new shape
            $_component_store[type].forEach(component => {
                const cKeys = Object.keys(component)
                // only apply new properties to the existing component (composite)
                const newKeys = shapeKeys.filter(key => !cKeys.includes(key))
                newKeys.forEach(key => { component[key] = shape[key] })
            })

            component_shape[type] = shape

        } else {

            componentCount++
            $_component_store[type] = []
            component_shape[type] = shape
            $_component_entityId[type] = []

            component_bitflag[type] = componentCount++
        }

        engine.emit('component-registered', type, shape, componentCount)
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
            throw new Error(`Tried to create an unregistered component type '${type}'`)
        
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
            throw new Error(`Attempted to add a component to a non-existent entity.`)

        if(!component_bitflag.hasOwnProperty(type)) 
            throw new Error(`Tried to add an unregistered component type '${type}'`)

        const flag = component_bitflag[type]

        // if it already has the component, set values (if any) and return
        if(entityId_bitmask[id].get(flag)) {
            return updateComponent(id, type, values)
        }

        const component = createComponent(type, values)
        
        component[ID_PROPERTY] = id

        entityId_bitmask[id].set(flag, 1)

        if($_component_store[type] == undefined)
            throw new Error(`Component type '${type}' is not registered.`)

        $_component_store[type].push(component)

        views
            .filter(view => view.bitmask.get(flag))
            .forEach(view => {
                // if entity matches with view
                if(bit.check(entityId_bitmask[id], view.bitmask)) {
                    // add entity to view and let view get components
                    view.add(id)
                }
            })

        $_component_entityId[type][id] = component

        engine.emit('component-added', component, id)
        
        return component
    }

    /**
     * Remove a component from an entity
     * @param {number} id to remove the component from
     * @param {string} type of component to remove from the entity
     */
    const componentRemovalQueue = []

    const _removeComponent = (id, type) => {
        const index = $_component_store[type].findIndex(c => c[ID_PROPERTY] == id)
        const component = $_component_store[type][index]
        
        if(!component) {
            // throw new Error(`Component type ${type} does not exist on entity${id}`)
            return
        }

        shiftDelete($_component_store[type], index)

        const flag = component_bitflag[type]

        // remove entity's component references from each relevant system
        views.forEach(view => {
            if(view.bitmask.get(flag))
                view.remove(id)
        })
        
        delete $_component_entityId[type][id]

        // clear the bitflag and index on the entity
        entityId_bitmask[id] = bit.clear(entityId_bitmask[id], flag)

        engine.emit('component-removed', component, id)
    }

    const removeComponent = (id, type, now=false) => {
        if(id === undefined || entities[id] === undefined)
            throw new Error(`Entity ID is undefined`)

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
        return $_component_entityId[type][id]
    }

    /**
     * 
     * @param {number} id to update
     * @param {string} type of component to update
     * @param {object} values to update on the component
     */
    const updateComponent = (id, type, values) => {
        return Object.assign(
            $_component_entityId[type][id], 
            shapeWithValues($_component_entityId[type][id], values)
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
            if(!$_component_store.hasOwnProperty(type))
                throw new Error(`'${type}' is not a registered component type`)
            return Object.assign(acc, { [type]: $_component_store[type].filter(entityBitmaskComponentFilter(queryMask)) });
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
        const existingView = views.find(view => view.bitmask.equals(bitmask))
        if(existingView) {
            return existingView
        }

        // new view
        const signature = createSignature(...componentTypes)
        view_bitmask[signature] = bitmask

        const $_cache = query(...componentTypes)
        view_components[signature] = $_cache

        const localEntities = $_cache[componentTypes[0]].map(c => c[ID_PROPERTY])
        view_entities[signature] = localEntities
        
        const view = {
            bitmask,
            entities: localEntities,
            onEnter: id => {},
            onExit: id => {},
            add: (id, swap=false) => {
                localEntities.push(id)
                
                const components = []
                componentTypes.forEach(type => {
                    const c = $_component_store[type].find(c => c[ID_PROPERTY] == id)
                    if(c === undefined)
                        throw new Error(`${type} component not found on entity.`)

                    $_cache[type].push(c)
                    components.push(c)
                })

                view.onEnter(...components, id)
            },
            remove: id => {
                // index to remove should be the same for entity and each component
                const i = localEntities.findIndex(id2 => id == id2)

                if(i === -1) return

                if(i === undefined) return
                
                shiftDelete(localEntities, i)
                
                const components = []
                componentTypes.forEach(type => {

                    const c = $_component_store[type].find(c => c[ID_PROPERTY] == id)
                    components.push(c)

                    shiftDelete($_cache[type], i)
                })

                view.onExit(...components, id)
            },
            // sort global arrays with this bitmask grouped together at the beginning of the array
            // should prioritize views with the most entities (group components at the beginning of their arrays by this bitmask)
            prioritize: () => {
                componentTypes.forEach(type => {
                    $_component_store[type].sort((a,b) => {
                        const maskA = entityId_bitmask[a]
                        return bit.check(maskA, bitmask)
                    })
                })
            }
        }

        Object.assign(view, $_cache)

        views.push(view)

        return view
    }


    // SYSTEMS //
    
    /**
     * 
     * @param {string} name of the system
     * @param {string[]} componentTypes that the system requires an entity to have
     * @param {function} setup function to call when the engine starts
     */
    const registerSystem = (name, componentTypes, setup, swap=false) => {
        // registerSystemDeferrals.push(() => {

            system_source[name] = setup.toString()
            system_types[name] = componentTypes

            const o = setup()

            let updateFn, enterFn, exitFn
            if(typeof o === 'function') {
                updateFn = setup()
            } else {
                updateFn = o.update
                enterFn = o.enter
                exitFn = o.exit
            }
            
            const view = createView(...componentTypes)
            system_view[name] = view

            if(enterFn) view.onEnter = enterFn
            if(exitFn) view.onExit = exitFn

            const parameters = componentTypes.map(type => view[type])
            system_parameters[name] = parameters

            const args = componentTypes.map((t,i) => parameters[i])
            const update = (i, id) => updateFn(...args.map(arg => arg[i]), id)

            const system = {
                process: () => {
                    if(updateFn !== undefined)
                    for(let i = 0; i < view.entities.length; i++)
                        update(i, view.entities[i])
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
            componentRemovalQueue.shift()()
        }
        while(entityRemovalQueue.length > 0){
            entityRemovalQueue.shift()()
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