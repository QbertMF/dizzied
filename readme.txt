start app
npx expo start (-clear)


I would like to have a PhysicsManager component. This component shall move through the geometry and create chunks of physics objects from the level geometry. Each Chunk shall have a list of trimeshes and an AABB.  The trimeshes shall be generated from the children in the geometry. As the children are all box or tapered boxed  trimeshes shall be used for the physics objects. The function splitttig the geometry shall create trimeshes from the children. The PhysicsManager shall have functions to add and remove chunks from the physics world based on a radius. The number of children within the chunks shall be configuratble through an input parameter in the constructor. The PhisicsManager shall have a Map of all te chunks. There shall be function unpdate Chunks to add and remove physics objecs based on the distance of the player,

Construct  the LevelManager
There shall be a LevelManager that generates a spindizzy like level from ascii tables. The whole level shall consist chunks of grids. 
The grids shall be 8x8 blocks. 
Each level block shall heve the following ascii tables describing the block:
There shall be an ascii table for the hight of each corner of blocks in integers. 
Each block shall have its independent values, distict from the neighbouring blocks.
Each block corner shall have two values.
One value shall be the base and the other value shall be the hight offset relative to the base. The offset might be 0.
There shall be two ascii table for the texture to be used. Integers are to be used. 
Both texture tables shall index into the 32*32 pixel size taxtures storeed in the 320X320 pixel "assets/textures.png".
The first array shall contain the indices of the texture of the sides of a block (if exists).
The other array shall be the index of the texture used on top of the block.
There shall be an ascii table for the object on top of the block (objectTable). "C" = crystal, "S"= switch, "L"= Lift
The level manager shall have a function to generate the block geometry from the ascii table. 
Blocks with 0 height and 0 offset shall not be generated.
Basically transforming the hight map into a level. 
There shall also be a funcion that delivers the trimesh information to be added to the cannon physics engine.
All tables shall use the maximum needed digits such that the columns are aligned for easier editing
There shall be an example level with flat areas, slopes and ramps also using the Objects in the objectTable.
The objects shall be generated from primitives.
The crystal is an octaeder, the sitch is a flat box, the lift is a platform.

