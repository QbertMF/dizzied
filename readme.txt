start app
npx expo start (-clear)


I would like to have a PhysicsManager component. This component shall move through the geometry and create chunks of physics objects from the level geometry. Each Chunk shall have a list of trimeshes and an AABB.  The trimeshes shall be generated from the children in the geometry. As the children are all box or tapered boxed  trimeshes shall be used for the physics objects. The function splitttig the geometry shall create trimeshes from the children. The PhysicsManager shall have functions to add and remove chunks from the physics world based on a radius. The number of children within the chunks shall be configuratble through an input parameter in the constructor. The PhisicsManager shall have a Map of all te chunks. There shall be function unpdate Chunks to add and remove physics objecs based on the distance of the player,
