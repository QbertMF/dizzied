import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * Physics chunk containing trimeshes and bounding box
 */
class PhysicsChunk {
  constructor(id, aabb) {
    this.id = id;
    this.aabb = aabb; // THREE.Box3
    this.trimeshes = []; // Array of CANNON.Trimesh objects
    this.physicsBodies = []; // Array of CANNON.Body objects
    this.isLoaded = false;
    this.meshChildren = []; // Original mesh children for trimesh generation
  }

  /**
   * Generate trimeshes from mesh children
   */
  generateTrimeshes() {
    console.log(`Generating trimeshes for chunk ${this.id} with ${this.meshChildren.length} children`);
    
    this.meshChildren.forEach((child, index) => {
      if (child.isMesh && child.geometry) {
        try {
          // Get geometry vertices and faces
          const geometry = child.geometry;
          
          // Ensure geometry has position attribute
          if (!geometry.attributes.position) {
            console.warn(`Mesh ${child.name || `child_${index}`} has no position attribute`);
            return;
          }

          // Convert BufferGeometry to trimesh format
          const vertices = [];
          const indices = [];
          
          const positionAttribute = geometry.attributes.position;
          
          // Extract vertices
          for (let i = 0; i < positionAttribute.count; i++) {
            vertices.push(
              positionAttribute.getX(i),
              positionAttribute.getY(i),
              positionAttribute.getZ(i)
            );
          }
          
          // Extract indices (faces)
          if (geometry.index) {
            // Indexed geometry
            const indexAttribute = geometry.index;
            for (let i = 0; i < indexAttribute.count; i++) {
              indices.push(indexAttribute.getX(i));
            }
          } else {
            // Non-indexed geometry
            for (let i = 0; i < positionAttribute.count; i++) {
              indices.push(i);
            }
          }
          
          // Create CANNON trimesh
          const trimesh = new CANNON.Trimesh(vertices, indices);
          
          // Apply world transform to trimesh
          const worldPosition = new THREE.Vector3();
          const worldQuaternion = new THREE.Quaternion();
          const worldScale = new THREE.Vector3();
          
          child.getWorldPosition(worldPosition);
          child.getWorldQuaternion(worldQuaternion);
          child.getWorldScale(worldScale);
          
          // Store trimesh with transform data
          this.trimeshes.push({
            trimesh: trimesh,
            position: worldPosition.clone(),
            quaternion: worldQuaternion.clone(),
            scale: worldScale.clone(),
            name: child.name || `trimesh_${index}`
          });
          
          console.log(`Created trimesh for ${child.name || `child_${index}`}: ${vertices.length / 3} vertices, ${indices.length / 3} faces`);
          
        } catch (error) {
          console.error(`Failed to create trimesh for ${child.name || `child_${index}`}:`, error);
        }
      }
    });
    
    console.log(`Generated ${this.trimeshes.length} trimeshes for chunk ${this.id}`);
  }

  /**
   * Add chunk to physics world
   */
  addToWorld(world) {
    if (this.isLoaded) return;
    
    console.log(`Loading chunk ${this.id} with ${this.trimeshes.length} trimeshes`);
    
    this.trimeshes.forEach((trimeshData, index) => {
      try {
        const body = new CANNON.Body({ 
          mass: 0, // Static body
          type: CANNON.Body.KINEMATIC 
        });
        
        body.addShape(trimeshData.trimesh);
        
        // Apply transform
        body.position.set(
          trimeshData.position.x,
          trimeshData.position.y,
          trimeshData.position.z
        );
        
        body.quaternion.set(
          trimeshData.quaternion.x,
          trimeshData.quaternion.y,
          trimeshData.quaternion.z,
          trimeshData.quaternion.w
        );
        
        // Add material for collision interaction
        body.material = new CANNON.Material({
          friction: 0.4,
          restitution: 0.3
        });
        
        world.addBody(body);
        this.physicsBodies.push(body);
        
        console.log(`Added trimesh body ${index + 1}/${this.trimeshes.length} to physics world for chunk ${this.id}`);
        
      } catch (error) {
        console.error(`Failed to add trimesh ${index} to world for chunk ${this.id}:`, error);
      }
    });
    
    this.isLoaded = true;
    console.log(`Chunk ${this.id} loaded with ${this.physicsBodies.length} physics bodies`);
  }

  /**
   * Remove chunk from physics world
   */
  removeFromWorld(world) {
    if (!this.isLoaded) return;
    
    console.log(`Unloading chunk ${this.id} with ${this.physicsBodies.length} bodies`);
    
    this.physicsBodies.forEach(body => {
      world.removeBody(body);
    });
    
    this.physicsBodies = [];
    this.isLoaded = false;
    console.log(`Chunk ${this.id} unloaded`);
  }

  /**
   * Get chunk center point
   */
  getCenter() {
    const center = new THREE.Vector3();
    this.aabb.getCenter(center);
    return center;
  }

  /**
   * Get distance from point to chunk center
   */
  getDistanceToPoint(point) {
    return this.getCenter().distanceTo(point);
  }
}

/**
 * PhysicsManager - Manages spatial partitioning and distance-based chunk loading
 */
export class PhysicsManager {
  constructor(options = {}) {
    // Configuration
    this.maxChildrenPerChunk = options.maxChildrenPerChunk || 10;
    this.loadRadius = options.loadRadius || 50;
    this.unloadRadius = options.unloadRadius || 80;
    this.chunkSize = options.chunkSize || 20; // Size of each chunk in world units
    
    // Internal state
    this.chunks = new Map(); // Map<string, PhysicsChunk>
    this.world = null;
    this.playerPosition = new THREE.Vector3(0, 0, 0);
    
    console.log('PhysicsManager initialized:', {
      maxChildrenPerChunk: this.maxChildrenPerChunk,
      loadRadius: this.loadRadius,
      unloadRadius: this.unloadRadius,
      chunkSize: this.chunkSize
    });
  }

  /**
   * Set the physics world reference
   */
  setWorld(world) {
    this.world = world;
    console.log('PhysicsManager: World reference set');
  }

  /**
   * Process GLTF model and create spatial chunks
   */
  processGeometry(model) {
    console.log('PhysicsManager: Processing geometry for spatial partitioning...');
    
    if (!model) {
      console.error('PhysicsManager: No model provided');
      return;
    }

    // Collect all mesh children
    const allMeshChildren = [];
    model.traverse((child) => {
      if (child.isMesh && child.geometry) {
        allMeshChildren.push(child);
      }
    });

    console.log(`Found ${allMeshChildren.length} mesh children to process`);

    // Calculate overall bounding box
    const overallBBox = new THREE.Box3().setFromObject(model);
    console.log('Overall bounding box:', {
      min: overallBBox.min,
      max: overallBBox.max
    });

    // Create spatial grid
    this.createSpatialChunks(allMeshChildren, overallBBox);
    
    console.log(`Created ${this.chunks.size} spatial chunks`);
  }

  /**
   * Create spatial chunks from mesh children
   */
  createSpatialChunks(meshChildren, overallBBox) {
    const size = overallBBox.getSize(new THREE.Vector3());
    const min = overallBBox.min;
    
    // Calculate grid dimensions
    const gridX = Math.ceil(size.x / this.chunkSize);
    const gridZ = Math.ceil(size.z / this.chunkSize);
    
    console.log(`Creating ${gridX}x${gridZ} spatial grid with chunk size ${this.chunkSize}`);

    // Create chunks and assign meshes
    for (let x = 0; x < gridX; x++) {
      for (let z = 0; z < gridZ; z++) {
        const chunkId = `chunk_${x}_${z}`;
        
        // Calculate chunk bounds
        const chunkMin = new THREE.Vector3(
          min.x + x * this.chunkSize,
          min.y,
          min.z + z * this.chunkSize
        );
        
        const chunkMax = new THREE.Vector3(
          min.x + (x + 1) * this.chunkSize,
          min.y + size.y,
          min.z + (z + 1) * this.chunkSize
        );
        
        const chunkAABB = new THREE.Box3(chunkMin, chunkMax);
        const chunk = new PhysicsChunk(chunkId, chunkAABB);
        
        // Find meshes that intersect with this chunk
        let childrenInChunk = 0;
        meshChildren.forEach(child => {
          if (childrenInChunk >= this.maxChildrenPerChunk) return;
          
          // Calculate child bounding box
          const childBBox = new THREE.Box3().setFromObject(child);
          
          // Check if child intersects with chunk
          if (chunkAABB.intersectsBox(childBBox)) {
            chunk.meshChildren.push(child);
            childrenInChunk++;
          }
        });
        
        // Only create chunks that have children
        if (chunk.meshChildren.length > 0) {
          // Generate trimeshes for this chunk
          chunk.generateTrimeshes();
          this.chunks.set(chunkId, chunk);
          
          console.log(`Created chunk ${chunkId} with ${chunk.meshChildren.length} children and ${chunk.trimeshes.length} trimeshes`);
        }
      }
    }
  }

  /**
   * Update player position and manage chunk loading/unloading
   */
  updateChunks(playerPosition) {
    this.playerPosition.copy(playerPosition);
    
    if (!this.world) {
      console.warn('PhysicsManager: No world reference set');
      return;
    }

    let loadedCount = 0;
    let unloadedCount = 0;

    this.chunks.forEach((chunk, chunkId) => {
      const distance = chunk.getDistanceToPoint(this.playerPosition);
      
      if (distance <= this.loadRadius && !chunk.isLoaded) {
        // Load chunk
        chunk.addToWorld(this.world);
        loadedCount++;
      } else if (distance > this.unloadRadius && chunk.isLoaded) {
        // Unload chunk
        chunk.removeFromWorld(this.world);
        unloadedCount++;
      }
    });

    if (loadedCount > 0 || unloadedCount > 0) {
      console.log(`PhysicsManager: Loaded ${loadedCount} chunks, unloaded ${unloadedCount} chunks`);
    }
  }

  /**
   * Add chunk to physics world by ID
   */
  addChunk(chunkId) {
    const chunk = this.chunks.get(chunkId);
    if (chunk && this.world) {
      chunk.addToWorld(this.world);
      return true;
    }
    return false;
  }

  /**
   * Remove chunk from physics world by ID
   */
  removeChunk(chunkId) {
    const chunk = this.chunks.get(chunkId);
    if (chunk && this.world) {
      chunk.removeFromWorld(this.world);
      return true;
    }
    return false;
  }

  /**
   * Get all loaded chunks
   */
  getLoadedChunks() {
    const loaded = [];
    this.chunks.forEach((chunk, id) => {
      if (chunk.isLoaded) {
        loaded.push(id);
      }
    });
    return loaded;
  }

  /**
   * Get chunks within radius of point
   */
  getChunksInRadius(position, radius) {
    const chunksInRadius = [];
    this.chunks.forEach((chunk, id) => {
      if (chunk.getDistanceToPoint(position) <= radius) {
        chunksInRadius.push(id);
      }
    });
    return chunksInRadius;
  }

  /**
   * Get physics manager status
   */
  getStatus() {
    const loadedChunks = this.getLoadedChunks();
    return {
      totalChunks: this.chunks.size,
      loadedChunks: loadedChunks.length,
      loadedChunkIds: loadedChunks,
      playerPosition: this.playerPosition.clone(),
      loadRadius: this.loadRadius,
      unloadRadius: this.unloadRadius
    };
  }

  /**
   * Cleanup all chunks
   */
  cleanup() {
    console.log('PhysicsManager: Cleaning up all chunks...');
    
    if (this.world) {
      this.chunks.forEach(chunk => {
        if (chunk.isLoaded) {
          chunk.removeFromWorld(this.world);
        }
      });
    }
    
    this.chunks.clear();
    console.log('PhysicsManager: Cleanup complete');
  }
}

// Export singleton instance
export const physicsManager = new PhysicsManager({
  maxChildrenPerChunk: 8,
  loadRadius: 30,
  unloadRadius: 50,
  chunkSize: 15
});