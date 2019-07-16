# 🌌 ModECS 🌌 
Small, fast, data-oriented, runtime-composable [ECS](https://en.wikipedia.org/wiki/Entity_component_system) library written in JavaScript.

Features

  - < 5 KB gzipped
  - Classless ES6
  - Performance focused
  - Runtime composable
  - Promotes reusability

Planned

  - [ ] Throttleable system update rates
  - [ ] Topological ordering of system loops based on component type dependencies
  - [ ] Serializable state & external store adapters
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

// create entities by passing in component types
const entity1 = engine.createEntity('POSITION', 'TARGET')

const entity2 = engine.createEntity()
// or add components manually
engine.addComponent(entity2, 'POSITION', { x: 50 })
// first argument can be an entity or its ID
engine.addComponent(entity2.id, 'TARGET', { x: 1, y: 1 }) // entity2 will move southeast

engine.addEntity(entity1)
engine.addEntity(entity2)

engine.start()
```

Check out the [Introduction](docs/introduction.md) for more details.
