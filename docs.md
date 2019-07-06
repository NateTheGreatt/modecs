### Table of Contents

-   [index][1]
    -   [Parameters][2]
-   [createEntity][3]
    -   [Parameters][4]
-   [addEntity][5]
    -   [Parameters][6]
-   [removeEntity][7]
    -   [Parameters][8]
-   [getEntity][9]
    -   [Parameters][10]
-   [registerComponent][11]
    -   [Parameters][12]
-   [createComponent][13]
    -   [Parameters][14]
-   [addComponent][15]
    -   [Parameters][16]
-   [addComponent][17]
    -   [Parameters][18]
-   [removeComponent][19]
    -   [Parameters][20]
-   [getComponent][21]
    -   [Parameters][22]
-   [updateComponent][23]
    -   [Parameters][24]
-   [createView][25]
    -   [Parameters][26]
-   [registerSystem][27]
    -   [Parameters][28]
-   [start][29]
    -   [Parameters][30]
-   [use][31]
    -   [Parameters][32]

## index

Creates an new instance of the Modecs engine (no need to invoke with 'new')

### Parameters

-   `options` **[object][33]** to pass into the engine (optional, default `{}`)
    -   `options.tickRate`   (optional, default `20`)

Returns **[object][33]** a new engine

## createEntity

Creates a new entity

### Parameters

-   `componentTypes` **...[string][34]** to add to the entity

Returns **[object][33]** a new entity

## addEntity

Add an entity to the engine

### Parameters

-   `entity` **[object][33]** to add to the engine

## removeEntity

Remove an entity from the engine

### Parameters

-   `entity` **[object][33]** to remove from the engine

## getEntity

Get an existing entity from the engine

### Parameters

-   `id` **[number][35]** of the entity to get

## registerComponent

Registers a new type of component with the engine

### Parameters

-   `type` **[string][34]** of the component
-   `shape` **[object][33]** of the component

## createComponent

Create a new component

### Parameters

-   `type` **[string][34]** of component to create
-   `values` **[object][33]** values to instantiate the component with (optional, default `{}`)

Returns **[object][33]** a new component

## addComponent

Add a component to an entity

### Parameters

-   `entity` **[object][33]** to add the component to
-   `component` **[object][33]** to add to the entity
-   `values` **[object][33]** to instantiate the component with (optional, default `{}`)
## addComponent

Add a component to an entity

### Parameters

-   `entity`
-   `component`
-   `values` **[object][33]** to instantiate the component with (optional, default `{}`)
## removeComponent

Remove a component from an entity

### Parameters

-   `entityId` **[number][35]** to remove the component from
-   `type` **[string][34]** of component to remove from the entity

## getComponent

### Parameters

-   `entityId` **[number][35]** to get the component from
-   `type` **[string][34]** of component to get

Returns **[object][33]** a component

## updateComponent

### Parameters

-   `entityId` **[number][35]** to update
-   `type` **[string][34]** of component to update
-   `values` **[object][33]** to update on the component

## createView

Creates a new view.
A view is a group of entities who have a certain set of components.

### Parameters

-   `componentTypes` **...[string][34]** to create a view of

## registerSystem

### Parameters

-   `name` **[string][34]** of the system
-   `componentTypes` **[Array][36]&lt;[string][34]>** that the system requires an entity to have
-   `setup` **[function][37]** function to call when the engine starts
-   `copy` **[boolean][38]** copy components into a local memory space (tends to increase performance) (optional, default `true`)

## start

Start the engine

### Parameters

-   `fn`

## use

Use a plugin

### Parameters

-   `fn`

[1]: #index

[2]: #parameters

[3]: #createentity

[4]: #parameters-1

[5]: #addentity

[6]: #parameters-2

[7]: #removeentity

[8]: #parameters-3

[9]: #getentity

[10]: #parameters-4

[11]: #registercomponent

[12]: #parameters-5

[13]: #createcomponent

[14]: #parameters-6

[15]: #addcomponent

[16]: #parameters-7

[17]: #addcomponent-1

[18]: #parameters-8

[19]: #removecomponent

[20]: #parameters-9

[21]: #getcomponent

[22]: #parameters-10

[23]: #updatecomponent

[24]: #parameters-11

[25]: #createview

[26]: #parameters-12

[27]: #registersystem

[28]: #parameters-13

[29]: #start

[30]: #parameters-14

[31]: #use

[32]: #parameters-15

[33]: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object 

[34]: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String 

[35]: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number 

[36]: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array  

[37]: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Statements/function   

[38]: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Boolean