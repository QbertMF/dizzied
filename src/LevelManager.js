import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * LevelChunk represents an 8x8 grid section of blocks
 */
class LevelChunk {
  constructor(chunkX, chunkZ, chunkSize = 8) {
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.chunkSize = chunkSize; // 8x8 blocks per chunk
    this.id = `chunk_${chunkX}_${chunkZ}`;
    
    // ASCII tables for this chunk (9x9 for corner heights - one extra for block corners)
    this.heightBase = [];     // 9x9 base heights
    this.heightOffset = [];   // 9x9 height offsets
    this.sideTextures = [];   // 8x8 side texture indices
    this.topTextures = [];    // 8x8 top texture indices
    this.objects = [];        // 8x8 object types ("C", "S", "L", " ")
    
    // Generated geometry and physics
    this.geometry = new THREE.Group();
    this.trimeshes = [];
    this.aabb = null;
    this.isLoaded = false;
    
    this.initializeEmptyChunk();
  }
  
  /**
   * Initialize chunk with empty/default data
   */
  initializeEmptyChunk() {
    // Initialize height arrays (9x9 for corners)
    for (let y = 0; y < 9; y++) {
      this.heightBase[y] = [];
      this.heightOffset[y] = [];
      for (let x = 0; x < 9; x++) {
        this.heightBase[y][x] = 0;
        this.heightOffset[y][x] = 0;
      }
    }
    
    // Initialize block data (8x8)
    for (let y = 0; y < 8; y++) {
      this.sideTextures[y] = [];
      this.topTextures[y] = [];
      this.objects[y] = [];
      
      for (let x = 0; x < 8; x++) {
        this.sideTextures[y][x] = 0;
        this.topTextures[y][x] = 0;
        this.objects[y][x] = ' '; // Empty
      }
    }
  }
  
  /**
   * Load chunk data from ASCII tables
   */
  loadFromASCII(heightBaseASCII, heightOffsetASCII, sideTexturesASCII, topTexturesASCII, objectsASCII) {
    // Parse base heights (9x9)
    const baseLines = heightBaseASCII.trim().split('\n');
    for (let y = 0; y < 9 && y < baseLines.length; y++) {
      const values = baseLines[y].trim().split(/\s+/);
      for (let x = 0; x < 9 && x < values.length; x++) {
        this.heightBase[y][x] = parseInt(values[x]) || 0;
      }
    }
    
    // Parse height offsets (9x9)
    const offsetLines = heightOffsetASCII.trim().split('\n');
    for (let y = 0; y < 9 && y < offsetLines.length; y++) {
      const values = offsetLines[y].trim().split(/\s+/);
      for (let x = 0; x < 9 && x < values.length; x++) {
        this.heightOffset[y][x] = parseInt(values[x]) || 0;
      }
    }
    
    // Parse side textures (8x8)
    const sideLines = sideTexturesASCII.trim().split('\n');
    for (let y = 0; y < 8 && y < sideLines.length; y++) {
      const values = sideLines[y].trim().split(/\s+/);
      for (let x = 0; x < 8 && x < values.length; x++) {
        this.sideTextures[y][x] = parseInt(values[x]) || 0;
      }
    }
    
    // Parse top textures (8x8)
    const topLines = topTexturesASCII.trim().split('\n');
    for (let y = 0; y < 8 && y < topLines.length; y++) {
      const values = topLines[y].trim().split(/\s+/);
      for (let x = 0; x < 8 && x < values.length; x++) {
        this.topTextures[y][x] = parseInt(values[x]) || 0;
      }
    }
    
    // Parse objects (8x8)
    const objectLines = objectsASCII.trim().split('\n');
    for (let y = 0; y < 8 && y < objectLines.length; y++) {
      const chars = objectLines[y].trim();
      for (let x = 0; x < 8 && x < chars.length; x++) {
        const char = chars[x];
        this.objects[y][x] = ['C', 'S', 'L'].includes(char) ? char : ' ';
      }
    }
  }
  
  /**
   * Get total height at corner (base + offset)
   */
  getCornerHeight(x, y) {
    return this.heightBase[y][x] + this.heightOffset[y][x];
  }
  
  /**
   * Generate 3D geometry from height maps and texture data
   */
  generateGeometry(textureManager) {
    this.geometry.clear();
    
    const worldOffsetX = this.chunkX * this.chunkSize;
    const worldOffsetZ = this.chunkZ * this.chunkSize;
    
    for (let z = 0; z < 8; z++) {
      for (let x = 0; x < 8; x++) {
        // Get corner heights for this block
        const h00 = this.getCornerHeight(x, z);       // Bottom-left
        const h10 = this.getCornerHeight(x + 1, z);   // Bottom-right
        const h01 = this.getCornerHeight(x, z + 1);   // Top-left
        const h11 = this.getCornerHeight(x + 1, z + 1); // Top-right
        
        // Skip blocks with zero height at all corners
        const maxHeight = Math.max(h00, h10, h01, h11);
        if (maxHeight === 0) continue;
        
        const worldX = worldOffsetX + x;
        const worldZ = worldOffsetZ + z;
        
        // Generate block geometry
        this.generateBlock(worldX, worldZ, h00, h10, h01, h11, 
                         this.sideTextures[z][x], this.topTextures[z][x], textureManager);
        
        // Add objects on top of blocks
        this.generateObject(worldX, worldZ, maxHeight, this.objects[z][x], textureManager);
      }
    }
    
    // Calculate AABB for this chunk
    this.geometry.computeBoundingBox();
    if (this.geometry.boundingBox) {
      this.aabb = this.geometry.boundingBox.clone();
    } else {
      this.aabb = new THREE.Box3();
    }
    
    console.log(`Generated geometry for chunk ${this.id}: ${this.geometry.children.length} objects`);
  }
  
  /**
   * Generate a block with variable corner heights (slopes/ramps)
   */
  generateBlock(worldX, worldZ, h00, h10, h01, h11, sideTexture, topTexture, textureManager) {
    // For React Native compatibility, use simple box geometry
    // Calculate average height for the block
    const avgHeight = (h00 + h10 + h01 + h11) / 4;
    
    if (avgHeight <= 0) return; // Skip blocks with no height
    
    const geometry = new THREE.BoxGeometry(1, avgHeight, 1);
    const material = textureManager.getSideMaterial(sideTexture);
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(worldX + 0.5, avgHeight / 2, worldZ + 0.5);
    mesh.name = `block_${worldX}_${worldZ}`;
    mesh.userData = { 
      type: 'block', 
      chunkId: this.id,
      cornerHeights: { h00, h10, h01, h11 },
      sideTexture,
      topTexture
    };
    
    this.geometry.add(mesh);
  }
  
  /**
   * Generate objects on top of blocks (Crystal, Switch, Lift)
   */
  generateObject(worldX, worldZ, height, objectType, textureManager) {
    if (objectType === ' ') return; // No object
    
    let geometry, material, name;
    
    switch (objectType) {
      case 'C': // Crystal - Octahedron
        geometry = new THREE.OctahedronGeometry(0.3);
        material = new THREE.MeshLambertMaterial({ 
          color: 0x00ffff, 
          transparent: true, 
          opacity: 0.8 
        });
        name = `crystal_${worldX}_${worldZ}`;
        break;
        
      case 'S': // Switch - Flat box
        geometry = new THREE.BoxGeometry(0.6, 0.1, 0.6);
        material = new THREE.MeshLambertMaterial({ color: 0xff0000 });
        name = `switch_${worldX}_${worldZ}`;
        break;
        
      case 'L': // Lift - Platform
        geometry = new THREE.BoxGeometry(0.8, 0.2, 0.8);
        material = new THREE.MeshLambertMaterial({ color: 0x808080 });
        name = `lift_${worldX}_${worldZ}`;
        break;
        
      default:
        return;
    }
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(worldX + 0.5, height + 0.2, worldZ + 0.5);
    mesh.name = name;
    mesh.userData = { 
      type: 'object', 
      objectType, 
      chunkId: this.id 
    };
    
    this.geometry.add(mesh);
  }
  
  /**
   * Generate trimesh data for physics engine
   */
  generateTrimeshes() {
    this.trimeshes = [];
    
    this.geometry.traverse((child) => {
      if (child.isMesh && child.geometry) {
        try {
          // Create simple box colliders for React Native compatibility
          const box = new THREE.Box3().setFromObject(child);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          
          // Create a simple box shape for physics
          const shape = new CANNON.Box(new CANNON.Vec3(size.x/2, size.y/2, size.z/2));
          
          this.trimeshes.push({
            shape,
            position: center,
            name: child.name,
            type: child.userData.type || 'unknown'
          });
          
        } catch (error) {
          console.error(`Failed to create trimesh for ${child.name}:`, error);
        }
      }
    });
    
    console.log(`Generated ${this.trimeshes.length} trimeshes for chunk ${this.id}`);
  }
}

/**
 * TextureManager handles 320x320 texture atlas with 32x32 textures
 */
class TextureManager {
  constructor() {
    this.textureAtlas = null;
    this.sideMaterials = new Map();
    this.topMaterials = new Map();
    this.textureSize = 32; // 32x32 pixel textures
    this.atlasSize = 320; // 320x320 pixel atlas
    this.texturesPerRow = this.atlasSize / this.textureSize; // 10 textures per row
  }
  
  /**
   * Load texture atlas from assets/textures.png
   */
  async loadTextureAtlas(textureUrl = 'assets/textures.png') {
    // For React Native compatibility, use simple colored materials
    console.log('Using simple colored materials for React Native compatibility');
    this.createFallbackMaterials();
  }
  
  /**
   * Create fallback colored materials
   */
  createFallbackMaterials() {
    // Pre-create some basic materials
    for (let i = 0; i < 100; i++) {
      const hue = (i * 36) % 360;
      const color = new THREE.Color().setHSL(hue / 360, 0.6, 0.5);
      const material = new THREE.MeshLambertMaterial({ color: color });
      
      this.sideMaterials.set(i, material);
      this.topMaterials.set(i, material.clone());
    }
  }
  
  /**
   * Get material for side texture
   */
  getSideMaterial(textureIndex) {
    if (!this.sideMaterials.has(textureIndex)) {
      const hue = (textureIndex * 36) % 360;
      const color = new THREE.Color().setHSL(hue / 360, 0.6, 0.5);
      const material = new THREE.MeshLambertMaterial({ color: color });
      this.sideMaterials.set(textureIndex, material);
    }
    return this.sideMaterials.get(textureIndex);
  }
  
  /**
   * Get material for top texture
   */
  getTopMaterial(textureIndex) {
    if (!this.topMaterials.has(textureIndex)) {
      const hue = (textureIndex * 36) % 360;
      const color = new THREE.Color().setHSL(hue / 360, 0.6, 0.3);
      const material = new THREE.MeshLambertMaterial({ color: color });
      this.topMaterials.set(textureIndex, material);
    }
    return this.topMaterials.get(textureIndex);
  }
}

/**
 * Spindizzy-style LevelManager with ASCII table support
 */
export class LevelManager {
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || 8; // 8x8 blocks per chunk
    this.chunks = new Map();
    this.textureManager = new TextureManager();
    this.isInitialized = false;
    
    console.log('LevelManager initialized with chunk size:', this.chunkSize);
  }

  /**
   * Initialize the level manager
   */
  async initialize(textureAtlasUrl = null) {
    await this.textureManager.loadTextureAtlas(textureAtlasUrl);
    this.isInitialized = true;
    console.log('LevelManager initialized successfully');
  }
  
  /**
   * Create a new chunk at the specified coordinates
   */
  createChunk(chunkX, chunkZ) {
    const chunkId = `chunk_${chunkX}_${chunkZ}`;
    
    if (this.chunks.has(chunkId)) {
      console.warn(`Chunk ${chunkId} already exists`);
      return this.chunks.get(chunkId);
    }
    
    const chunk = new LevelChunk(chunkX, chunkZ, this.chunkSize);
    this.chunks.set(chunkId, chunk);
    
    console.log(`Created chunk ${chunkId}`);
    return chunk;
  }
  
  /**
   * Load chunk data from ASCII tables
   */
  loadChunkFromASCII(chunkX, chunkZ, heightBaseASCII, heightOffsetASCII, sideTexturesASCII, topTexturesASCII, objectsASCII) {
    const chunk = this.createChunk(chunkX, chunkZ);
    chunk.loadFromASCII(heightBaseASCII, heightOffsetASCII, sideTexturesASCII, topTexturesASCII, objectsASCII);
    return chunk;
  }
  
  /**
   * Generate geometry for a specific chunk
   */
  generateChunkGeometry(chunkX, chunkZ) {
    const chunkId = `chunk_${chunkX}_${chunkZ}`;
    const chunk = this.chunks.get(chunkId);
    
    if (!chunk) {
      console.error(`Chunk ${chunkId} not found`);
      return null;
    }
    
    if (!this.isInitialized) {
      console.error('LevelManager not initialized. Call initialize() first.');
      return null;
    }
    
    chunk.generateGeometry(this.textureManager);
    return chunk.geometry;
  }
  
  /**
   * Generate trimesh data for a specific chunk
   */
  generateChunkTrimeshes(chunkX, chunkZ) {
    const chunkId = `chunk_${chunkX}_${chunkZ}`;
    const chunk = this.chunks.get(chunkId);
    
    if (!chunk) {
      console.error(`Chunk ${chunkId} not found`);
      return [];
    }
    
    chunk.generateTrimeshes();
    return chunk.trimeshes;
  }
  
  /**
   * Get all trimeshes for physics engine
   */
  getAllTrimeshes() {
    const allTrimeshes = [];
    
    for (const chunk of this.chunks.values()) {
      if (chunk.trimeshes.length === 0) {
        chunk.generateTrimeshes();
      }
      allTrimeshes.push(...chunk.trimeshes);
    }
    
    return allTrimeshes;
  }

  /**
   * Create example Spindizzy-style level with flat areas, slopes, ramps and objects
   */
  createExampleLevel() {
    // Height base map (9x9 corners for 8x8 blocks)
    const heightBase = `
00 00 00 00 00 00 00 00 00
00 01 01 01 01 01 01 01 00
00 01 02 02 02 02 02 01 00
00 01 02 03 03 03 02 01 00
00 01 02 03 04 03 02 01 00
00 01 02 03 03 03 02 01 00
00 01 02 02 02 02 02 01 00
00 01 01 01 01 01 01 01 00
00 00 00 00 00 00 00 00 00`;

    // Height offset map (9x9 corners for 8x8 blocks)
    const heightOffset = `
00 00 00 00 00 00 00 00 00
00 00 00 01 01 01 00 00 00
00 00 01 01 02 01 01 00 00
00 00 01 02 02 02 01 00 00
00 00 01 02 03 02 01 00 00
00 00 01 02 02 02 01 00 00
00 00 01 01 02 01 01 00 00
00 00 00 01 01 01 00 00 00
00 00 00 00 00 00 00 00 00`;

    // Side texture indices (8x8 blocks) - using 2-digit format
    const sideTextures = `
01 02 03 04 05 06 07 08
09 10 11 12 13 14 15 16
17 18 19 20 21 22 23 24
25 26 27 28 29 30 31 32
33 34 35 36 37 38 39 40
41 42 43 44 45 46 47 48
49 50 51 52 53 54 55 56
57 58 59 60 61 62 63 64`;

    // Top texture indices (8x8 blocks) - using 2-digit format
    const topTextures = `
65 66 67 68 69 70 71 72
73 74 75 76 77 78 79 80
81 82 83 84 85 86 87 88
89 90 91 92 93 94 95 96
97 98 99 00 01 02 03 04
05 06 07 08 09 10 11 12
13 14 15 16 17 18 19 20
21 22 23 24 25 26 27 28`;

    // Object placement (8x8 blocks) - C=Crystal, S=Switch, L=Lift, space=empty
    const objects = `
C   S   L
  C   S  
    L   C
S     L  
  L   C  
C   S    
  S   L  
L   C   S`;

    // Load the example chunk
    this.loadChunkFromASCII(0, 0, heightBase, heightOffset, sideTextures, topTextures, objects);
    
    // Generate geometry for the chunk
    const chunkGeometry = this.generateChunkGeometry(0, 0);
    
    console.log('Example Spindizzy level created with flat areas, slopes, ramps and objects');
    return chunkGeometry;
  }

  /**
   * Create a simple test level - just a basic platform (fallback)
   */
  createTestLevel() {
    // Try to create the full example level first
    if (this.isInitialized) {
      return this.createExampleLevel();
    }
    
    // Fallback to simple platform
    const geometry = new THREE.Group();
    
    const platformGeometry = new THREE.BoxGeometry(10, 1, 10);
    const platformMaterial = new THREE.MeshLambertMaterial({ color: 0x808080 });
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.position.set(0, -0.5, 0);
    platform.name = 'platform';
    
    geometry.add(platform);
    
    console.log('Simple test level created (fallback)');
    return geometry;
  }

  /**
   * Create physics bodies for all loaded chunks
   */
  createTrimesh() {
    // If we have chunks loaded, use their trimeshes
    if (this.chunks.size > 0) {
      const allTrimeshes = this.getAllTrimeshes();
      const bodies = [];
      
      for (const trimeshData of allTrimeshes) {
        const body = new CANNON.Body({ mass: 0 });
        body.addShape(trimeshData.shape);
        body.position.copy(trimeshData.position);
        bodies.push(body);
      }
      
      console.log(`Created ${bodies.length} physics bodies from chunks`);
      return bodies;
    }
    
    // Fallback to simple platform
    const shape = new CANNON.Box(new CANNON.Vec3(5, 0.5, 5));
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(shape);
    body.position.set(0, -0.5, 0);
    
    return [body];
  }

  /**
   * Get simple statistics
   */
  getStats() {
    return {
      isInitialized: this.isInitialized,
      totalTrimeshes: this.getAllTrimeshes().length,
      chunksLoaded: this.chunks.size
    };
  }

  /**
   * Cleanup
   */
  cleanup() {
    for (const chunk of this.chunks.values()) {
      chunk.geometry.clear();
      chunk.trimeshes = [];
    }
    this.chunks.clear();
    
    this.textureManager.sideMaterials.clear();
    this.textureManager.topMaterials.clear();
    
    console.log('LevelManager cleanup complete');
  }
}

// Export singleton instance for easy use
export const levelManager = new LevelManager({
  chunkSize: 8
});