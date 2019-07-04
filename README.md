# :evergreen_tree: fir :evergreen_tree:
Fast, data-oriented, runtime-composable [ECS](https://en.wikipedia.org/wiki/Entity_component_system) library written in JavaScript.

## Introduction

### Install
```
npm i fir
```

### Example

If you are familiar with the concept of an ECS already, this should look relatively familiar:

```javascript
const Fir = require('fir')
const engine = Fir()

// register components with a name and shape
engine.registerComponent('POSITION', { x: 0, y: 0 })
engine.registerComponent('TARGET', { x: 0, y: 0 })

engine.registerSystem(
  // name of the system
  'Movement',
  // component types required by the system
  ['POSITION','TARGET'],
  // a setup function to initialize the system with
  () => {
    const speed = 10

    // position and target components are injected into this function per-entity that has the required components on it
    return (position, target) => {
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

## Philosophy

With Fir it is best to follow the [Unix Philosophy](https://en.wikipedia.org/wiki/Unix_philosophy). In general, this means that you should strive to make your systems and components as simple as possible. If this means breaking one large feature into multiple smaller systems that pass information through components, generally that will be more maintainable, composable, and reusable than larger monolithic systems will be. That said, each system incurs one loop through all of its own entities, so if performance is an important aspect of the system it may be better to design it monolithically. Use your best discretion here.

### Runtime Composability

Not only can you register and add new components to entities during runtime, but new systems can be registered during runtime as well (after `engine.start()` has been called and the update loop is running). This creates an environment much like Unity3D or Unreal Engine provides, where the game world constantly runs while the user edits features in real-time without restarting the IDE. Re-registering something with the same name simply overwrites the previous registration.

### Events

The Fir engine inherits [`eventemitter3`](https://github.com/primus/eventemitter3). The prime goal of this is to keep communication decoupled throughout all of the game's individual features, supplementing the fact that systems can be added and removed during runtime.

This creates a powerful paradigm in which you can create entirely "pluggable" features that can interact with systems both registered and yet to be registered.

### Rules

Do not listen to events inside of systems. Information should only enter a system via components. However, information can exit a system via both components and events.

Components should be as small and flat as possible to ensure maximum performance.

### Modes

Modes are self-contained packages of code that register new systems and components that you can "plug in" to the engine by calling `engine.use()`.

E.g.

```javascript
const JitterMode = engine => {

  engine.registerComponent('JITTER', {amount: 5})

  engine.registerSystem(
    'Jitter',
    ['POSITION', 'JITTER'],
    () => {
      const randomRange = (min, max) => Math.random() * (max - min) + min
      return (position, jitter) => {
        let xJitter = randomRange(-jitter.amount, jitter.amount)
        let yJitter = randomRange(-jitter.amount, jitter.amount)

        // jittered a little too much, emit an event
        if(xJitter >= jitter.amount/2) engine.emit('jitterbug-happened', position, xJitter)

        position.x += xJitter
        position.y += yJitter
      }
    }
  )

}

engine.use(JitterMode)

engine.registerComponent('JITTERBUG', {amount:0})
engine.registerSystem(
  'JitterBugReactor',
  ['JITTERBUG'],
  () => {
    return (jitterbug) => {
      // what shall we do with this jitterbug?
    }
  }
)

// this is where game logic is best kept
engine.on('jitterbug-happened', (position, xJitter) => {
  const entityId = position.id

  // stop the jittering behavior
  engine.removeComponent(entityId, 'JITTER')

  // start the jitterbugging behavior, whatever that may be
  engine.addComponent(entityId, 'JITTERBUG', {amount: xJitter})
})

```

### Generic Logic vs Gamemode-Specific Logic

The best rule of thumb to keep in mind while developing in Fir is this:

Generic logic that doesn't necessarily apply only to your gamemode should be contained within a system.
Gamemode-specific logic should be handled by an event listener, defined outside of the emitting system.

When breaking up features into smaller system pieces, the generic information should flow from system-to-system within components.
Any and all gamemode-specific information should be delegated and handled in an event listener instead. The gamemode logic can then react appropriately to the vision of the game, meanwhile the system logic remains reusable for other types of gamemodes.

This is more or less a guideline to follow, and not necessarily a rule to abide by. Most of the time you will need to create systems with game-specific logic in them until you are able to discover what behavior is generic and what behavior is specific.