# :evergreen_tree: fir :evergreen_tree:
Data-oriented, runtime-composable ECS library

### Introduction

#### Install
```
npm i fir
```

#### Example
```javascript
const Fir = require('fir')
const engine = Fir()

engine.registerComponent('POSITION', { x: 0, y: 0 })
engine.registerComponent('TARGET', { x: 0, y: 0 })

engine.registerSystem(
  'Movement',
  ['POSITION','TARGET'], 
  () => {
    const speed = 10
    return (position, target) => {
      position.x += target.x * speed * engine.time.delta
      position.y += target.y * speed * engine.time.delta
      target.x = target.y = 0
    }
  }
)

const entity1 = engine.createEntity('POSITION', 'TARGET')

const entity2 = engine.createEntity()
engine.addComponent(entity2, 'POSITION', { x: 50 })
engine.addComponent(entity2.id, 'TARGET', { x: 1, y: 2 })

engine.addEntity(entity1)
engine.addEntity(entity2)

engine.start()

```

### Philosophy

Todo
