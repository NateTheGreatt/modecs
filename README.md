## DEPRECATED
See https://github.com/NateTheGreatt/bitecs for my new high-performance ECS library

# 🌌 ModECS 🌌 
Small, fast, data-oriented, runtime-composable [ECS](https://en.wikipedia.org/wiki/Entity_component_system) library written in JavaScript.

Features

  - ~5 KB gzipped
  - Classless ES6
  - Performance focused
  - Runtime composable
  - Promotes reusability

Planned

  - [ ] Topological ordering of system loops based on component type dependencies
  - [x] Serializable state (all the way down to systems & their update functions)
  - [ ] External store adapters
  - [ ] [V programming language](https://vlang.io/) port with Node bindings to the same API

## Install
```
npm i modecs
```

## Example

```javascript
const ModECS = require('modecs')
const engine = ModECS()

// register components with a name and shape
engine.registerComponent('POSITION', { x: 0, y: 0 })
engine.registerComponent('TARGET', { x: 0, y: 0 })

engine.registerSystem(
  // name of the system
  'Movement',
  // component types required by the system
  ['POSITION','TARGET'],
  // a setup function to initialize the system with (happens once)
  () => {
    const speed = 10

    // return the update function to be called every tick
    // position and target components, as well as the entityId they exist on are injected
    return (position, target, entityId) => {
      position.x += target.x * speed * engine.time.delta
      position.y += target.y * speed * engine.time.delta
    }
  }
)

// createEntity returns a new ID
const entityID1 = engine.createEntity()
engine.addEntity(entityID1)

const entityID2 = engine.createEntity()
engine.addEntity(entityID2) // must add entity to the engine before adding components

// add components to an ID with a name and shape
engine.addComponent(entityID2, 'POSITION', { x: 50 })
engine.addComponent(entityID2, 'TARGET', { x: 1, y: 1 }) // entity2 will move southeast

engine.start()
```

Check out the [Introduction](docs/introduction.md) for more details.
