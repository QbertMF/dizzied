import { Asset } from 'expo-asset';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
// Note: Using THREE.TextureLoader instead of expo-three TextureLoader

// Static asset registry - add your assets here
const ASSET_REGISTRY = {
  textures: {
    'block01.png': require('../assets/block01.png'),
    'block02.png': require('../assets/block02.png'),
    // Add more textures here as needed
  },
  models: {
    'level1.glb': require('../assets/level1.glb'),
    'level2.glb': require('../assets/level2.glb'),
    // Add more models here as needed
  }
};

export class AssetManager {
  constructor() {
    this.loadedTextures = new Map();
    this.loadedModels = new Map();
    this.gltfLoader = new GLTFLoader();
    this.gl = null; // Store GL context
  }
  
  /**
   * Set the WebGL context for texture loading
   * @param {WebGLRenderingContext} gl - The WebGL context
   */
  setGLContext(gl) {
    this.gl = gl;
    console.log('AssetManager: GL context set');
  }

  /**
   * Load a texture from the assets folder
   * @param {string} textureName - Name of the texture file (e.g., 'block01.png')
   * @param {string} textureKey - Key to store texture under (optional, defaults to textureName)
   * @returns {Promise<THREE.Texture|null>}
   */
  async loadTexture(textureName, textureKey = null) {
    const key = textureKey || textureName;
    
    // Return cached texture if already loaded
    if (this.loadedTextures.has(key)) {
      console.log(`Using cached texture: ${key}`);
      return this.loadedTextures.get(key);
    }

    try {
      console.log(`Loading texture: ${textureName}...`);
      
      // Check if texture exists in registry
      if (!ASSET_REGISTRY.textures[textureName]) {
        throw new Error(`Texture ${textureName} not found in asset registry. Please add it to ASSET_REGISTRY.textures in AssetManager.js`);
      }
      
      // Load asset using registry
      const textureAsset = Asset.fromModule(ASSET_REGISTRY.textures[textureName]);
      await textureAsset.downloadAsync();
      console.log(`Texture asset downloaded: ${textureName}`);
      console.log('Asset info:', {
        localUri: textureAsset.localUri,
        uri: textureAsset.uri,
        width: textureAsset.width,
        height: textureAsset.height
      });
      
      // Use THREE.TextureLoader instead of expo-three (which we removed)
      console.log('Using THREE.TextureLoader without expo-three dependency...');
      const textureLoader = new THREE.TextureLoader();
      
      const texture = await new Promise((resolve, reject) => {
        textureLoader.load(
          textureAsset.uri,
          (loadedTexture) => {
            console.log('THREE.TextureLoader success! Texture loaded.');
            resolve(loadedTexture);
          },
          (progress) => {
            console.log('Texture loading progress:', progress);
          },
          (error) => {
            console.error('THREE.TextureLoader error:', error);
            reject(error);
          }
        );
      });
      
      if (!texture) {
        throw new Error('Texture loading returned null');
      }
      
      console.log('Raw texture loaded:', {
        hasImage: !!texture.image,
        isTexture: texture.isTexture,
        width: texture.image?.width,
        height: texture.image?.height
      });
      
      // Configure texture settings
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.flipY = false;
      texture.needsUpdate = true; // Force update
      
      // Cache the texture
      this.loadedTextures.set(key, texture);
      console.log(`Texture loaded and cached: ${key}`);
      
      return texture;
    } catch (error) {
      console.error(`Failed to load texture ${textureName}:`, error);
      return null;
    }
  }

  /**
   * Load a GLTF model from the assets folder
   * @param {string} modelName - Name of the GLTF file (e.g., 'level2.glb')
   * @param {string} modelKey - Key to store model under (optional, defaults to modelName)
   * @returns {Promise<THREE.Group|null>}
   */
  async loadModel(modelName, modelKey = null) {
    const key = modelKey || modelName;
    
    // Return cached model if already loaded
    if (this.loadedModels.has(key)) {
      console.log(`Using cached model: ${key}`);
      // Return a clone so the original stays cached
      return this.loadedModels.get(key).clone();
    }

    try {
      console.log(`Loading GLTF model: ${modelName}...`);
      
      // Check if model exists in registry
      if (!ASSET_REGISTRY.models[modelName]) {
        throw new Error(`Model ${modelName} not found in asset registry. Please add it to ASSET_REGISTRY.models in AssetManager.js`);
      }
      
      // Load asset using registry
      const asset = Asset.fromModule(ASSET_REGISTRY.models[modelName]);
      await asset.downloadAsync();
      console.log(`GLTF asset downloaded: ${modelName}`);
      console.log('Asset details:', {
        localUri: asset.localUri,
        uri: asset.uri,
        name: asset.name,
        type: asset.type,
        hash: asset.hash
      });
      
      // Determine the correct URI to use
      // GLTFLoader has issues with file:// URIs in React Native, prefer HTTP URI
      let modelUri = asset.uri || asset.localUri;
      if (!modelUri) {
        throw new Error('Asset has no URI available for loading');
      }
      
      // If we got a file:// URI and have an HTTP alternative, use HTTP
      if (modelUri.startsWith('file://') && asset.uri && asset.uri.startsWith('http')) {
        modelUri = asset.uri;
        console.log('Switching from file:// to HTTP URI for better GLTFLoader compatibility');
      }
      
      console.log(`Loading GLTF from URI: ${modelUri}`);
      
      // Load GLTF with fetch-based approach (better React Native compatibility)
      console.log('Using fetch-based GLTF loading for React Native compatibility...');
      
      const gltf = await new Promise(async (resolve, reject) => {
        try {
          // Fetch the GLTF file as ArrayBuffer
          console.log('Fetching GLTF data...');
          const response = await fetch(modelUri);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const arrayBuffer = await response.arrayBuffer();
          console.log(`GLTF data fetched: ${arrayBuffer.byteLength} bytes`);
          
          // Parse with GLTFLoader
          this.gltfLoader.parse(
            arrayBuffer,
            '', // resourcePath - empty for arraybuffer
            (loadedGltf) => {
              console.log('GLTF parsed successfully:', {
                hasScene: !!loadedGltf.scene,
                sceneChildren: loadedGltf.scene?.children?.length || 0,
                animations: loadedGltf.animations?.length || 0
              });
              resolve(loadedGltf);
            },
            (error) => {
              console.error('GLTF parse error:', error);
              reject(error);
            }
          );
        } catch (fetchError) {
          console.error('Error fetching GLTF:', fetchError);
          reject(fetchError);
        }
      });
      
      if (!gltf || !gltf.scene) {
        throw new Error('GLTF loaded but scene is missing');
      }
      
      // Process the loaded model
      console.log('Processing GLTF scene...');
      const scene = gltf.scene;
      
      // Ensure the scene is properly set up
      scene.traverse((child) => {
        if (child.isMesh) {
          // Ensure geometry is available
          if (child.geometry) {
            child.geometry.computeBoundingBox();
            child.geometry.computeBoundingSphere();
          }
          
          // Ensure material is available
          if (!child.material) {
            child.material = new THREE.MeshStandardMaterial({ color: 0x888888 });
          }
        }
      });
      
      // Cache the model
      this.loadedModels.set(key, scene);
      console.log(`Model processed and cached: ${key}`);
      console.log(`Scene contains ${scene.children.length} children`);
      
      // Return a clone
      return scene.clone();
    } catch (error) {
      console.error(`Failed to load model ${modelName}:`, error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      // Try to provide more specific error information
      if (error.message && error.message.includes('match')) {
        console.error('URI matching error - this might be related to GLTFLoader compatibility with React Native');
        try {
          console.error('Asset details:', {
            localUri: asset?.localUri,
            uri: asset?.uri,
            name: asset?.name
          });
        } catch (assetLogError) {
          console.error('Could not log asset details:', assetLogError.message);
        }
      }
      
      return null;
    }
  }

  /**
   * Apply a texture to all meshes in a model
   * @param {THREE.Group} model - The 3D model
   * @param {THREE.Texture} texture - The texture to apply
   * @param {Object} materialProperties - Additional material properties
   */
  applyTextureToModel(model, texture, materialProperties = {}) {
    if (!model) {
      console.warn('Model is null, cannot apply texture');
      return;
    }
    
    if (!texture) {
      console.warn('Texture is null, cannot apply texture');
      return;
    }
    
    console.log('Texture info:', {
      hasImage: !!texture.image,
      isTexture: texture.isTexture,
      needsUpdate: texture.needsUpdate,
      format: texture.format,
      type: texture.type
    });

    let meshCount = 0;
    model.traverse((child) => {
      if (child.isMesh) {
        meshCount++;
        
        try {
          const material = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.7,
            metalness: 0.1,
            ...materialProperties
          });
          
          child.material = material;
          console.log(`Texture applied to mesh ${meshCount}: ${child.name || 'unnamed'}`);
        } catch (materialError) {
          console.error(`Failed to apply texture to mesh ${meshCount}:`, materialError);
          // Fallback to colored material for this mesh
          const fallbackMaterial = new THREE.MeshStandardMaterial({
            color: 0x888888,
            roughness: 0.6,
            metalness: 0.1
          });
          child.material = fallbackMaterial;
        }
      }
    });
    
    console.log(`Texture application attempted on ${meshCount} meshes`);
  }

  /**
   * Apply colored materials to a model (fallback when no texture)
   * @param {THREE.Group} model - The 3D model
   * @param {Array} colors - Array of hex colors to cycle through
   */
  applyColoredMaterials(model, colors = [0xff6b6b, 0x4ecdc4, 0x45b7d1, 0x96ceb4, 0xffeaa7, 0x888888]) {
    if (!model) {
      console.warn('Model is null, cannot apply materials');
      return;
    }

    let meshCount = 0;
    model.traverse((child) => {
      if (child.isMesh) {
        const color = colors[meshCount % colors.length];
        
        const material = new THREE.MeshStandardMaterial({
          color: color,
          roughness: 0.6,
          metalness: 0.1
        });
        
        child.material = material;
        console.log(`Colored material applied to mesh ${meshCount + 1}: ${child.name || 'unnamed'} (color: ${color.toString(16)})`);
        meshCount++;
      }
    });
    
    console.log(`Colored materials applied to ${meshCount} meshes`);
  }

  /**
   * Load a complete level (model + texture)
   * @param {string} modelName - GLTF model filename
   * @param {string} textureName - Texture filename (optional)
   * @param {string} levelKey - Key to cache the level under
   * @returns {Promise<THREE.Group|null>}
   */
  async loadLevel(modelName, textureName = null, levelKey = null) {
    console.log(`Loading level: ${modelName} ${textureName ? 'with texture ' + textureName : 'without texture'}`);
    
    // Load model
    const model = await this.loadModel(modelName, levelKey);
    if (!model) {
      console.error('Model loading failed, cannot proceed with level loading');
      return null;
    }

    // Apply texture or colored materials
    if (textureName) {
      console.log(`Attempting to load texture: ${textureName}`);
      const texture = await this.loadTexture(textureName);
      if (texture) {
        console.log(`Texture loaded successfully, applying to model`);
        this.applyTextureToModel(model, texture);
      } else {
        console.warn(`Texture loading failed for ${textureName}, using colored materials`);
        this.applyColoredMaterials(model);
      }
    } else {
      console.log('No texture specified, using colored materials');
      this.applyColoredMaterials(model);
    }

    return model;
  }

  /**
   * Unload assets to free memory
   * @param {string} key - Key of asset to unload (optional, unloads all if not provided)
   */
  unloadAssets(key = null) {
    if (key) {
      this.loadedTextures.delete(key);
      this.loadedModels.delete(key);
      console.log(`Unloaded assets for key: ${key}`);
    } else {
      this.loadedTextures.clear();
      this.loadedModels.clear();
      console.log('All assets unloaded');
    }
  }

  /**
   * Get info about loaded assets
   */
  getAssetInfo() {
    return {
      textureCount: this.loadedTextures.size,
      modelCount: this.loadedModels.size,
      textures: Array.from(this.loadedTextures.keys()),
      models: Array.from(this.loadedModels.keys())
    };
  }
}

// Export a singleton instance
export const assetManager = new AssetManager();