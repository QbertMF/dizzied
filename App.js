import React from 'react';
import { GLView } from 'expo-gl';
import { Renderer, TextureLoader as ExpoTextureLoader } from 'expo-three';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import * as CANNON from 'cannon-es';

export default function App() {
  console.log('App component started');
  
  return (
    <GLView
      style={{ flex: 1 }}
      onContextCreate={async (gl) => {
        console.log('GLView context created');
        
        // Declare all variables at the top level
        let renderer, scene, camera, world, model = null, modelBody = null;
        
        try {
          console.log('Initializing renderer...');
          renderer = new Renderer({ gl });
          renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
          console.log('Renderer initialized');

          console.log('Creating scene and camera...');
          scene = new THREE.Scene();
          camera = new THREE.PerspectiveCamera(75, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 1000);
          camera.position.set(0, 2, 5);
          console.log('Scene and camera created');

          // Add lighting
          console.log('Adding lights...');
          const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
          scene.add(ambientLight);
          
          const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
          directionalLight.position.set(10, 10, 5);
          scene.add(directionalLight);
          console.log('Lights added');

          // Physics setup
          console.log('Setting up physics...');
          world = new CANNON.World();
          world.gravity.set(0, -9.82, 0);
          console.log('Physics setup complete');
          
          console.log('Starting GLTF loading process...');
        } catch (setupError) {
          console.error('Error during setup:', setupError);
          return; // Exit if setup fails
        }
        
        try {
          // Try loading texture with expo-three's TextureLoader
          console.log('Loading texture with expo-three TextureLoader...');
          let texture = null;
          
          try {
            const textureAsset = Asset.fromModule(require('./assets/block01.png'));
            await textureAsset.downloadAsync();
            console.log('Texture asset downloaded:', textureAsset.localUri || textureAsset.uri);
            
            // Use expo-three's TextureLoader instead of Three.js TextureLoader
            texture = await ExpoTextureLoader.loadAsync(textureAsset);
            
            // Configure texture settings
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.flipY = false;
            
            console.log('Texture loaded with expo-three TextureLoader successfully');
          } catch (textureError) {
            console.warn('Expo TextureLoader failed, trying alternative approach:', textureError);
            
            // Alternative: Try creating texture from asset URI directly
            try {
              const textureAsset = Asset.fromModule(require('./assets/block01.png'));
              await textureAsset.downloadAsync();
              
              texture = new THREE.Texture();
              const image = new Image();
              image.crossOrigin = 'anonymous';
              image.onload = () => {
                texture.image = image;
                texture.needsUpdate = true;
                console.log('Texture loaded via Image element');
              };
              image.onerror = (err) => {
                console.error('Image loading failed:', err);
                texture = null;
              };
              image.src = textureAsset.localUri || textureAsset.uri;
              
              // Wait a moment for image to load
              await new Promise(resolve => setTimeout(resolve, 500));
              
            } catch (altError) {
              console.error('Alternative texture loading failed:', altError);
              texture = null;
            }
          }
          
          // Load the GLTF model
          console.log('Loading GLTF asset...');
          const asset = Asset.fromModule(require('./assets/level2.glb'));
          await asset.downloadAsync();
          console.log('GLTF asset downloaded:', asset.localUri || asset.uri);
          
          console.log('Creating GLTF loader...');
          const loader = new GLTFLoader();
          
          console.log('Loading GLTF file...');
          const gltf = await new Promise((resolve, reject) => {
            loader.load(
              asset.localUri || asset.uri,
              (loadedGltf) => {
                console.log('GLTF file loaded successfully');
                resolve(loadedGltf);
              },
              (progress) => {
                console.log('GLTF loading progress:', progress);
              },
              (error) => {
                console.error('GLTF loading error:', error);
                reject(error);
              }
            );
          });
          
          console.log('Processing GLTF scene...');
          if (!gltf || !gltf.scene) {
            throw new Error('GLTF loaded but scene is missing');
          }
          
          model = gltf.scene;
          console.log('Model assigned from gltf.scene');
          
          model.scale.set(1, 1, 1);
          model.position.set(0, 0, 0);
          console.log('Model scale and position set');
          
          // Apply materials to all meshes in the loaded model
          try {
            console.log('Starting mesh traversal...');
            let meshCount = 0;
            
            model.traverse((child) => {
              console.log('Traversing child:', child.type, child.name || 'unnamed');
              
              if (child.isMesh) {
                meshCount++;
                console.log(`Processing mesh ${meshCount}:`, child.name || 'unnamed');
                
                try {
                  let material;
                  
                  if (texture && texture.image) {
                    // Create material with texture
                    material = new THREE.MeshStandardMaterial({
                      map: texture,
                      roughness: 0.7,
                      metalness: 0.1
                    });
                    console.log(`Textured material applied to mesh ${meshCount}`);
                  } else {
                    // Fallback to colored material
                    const colors = [0xff6b6b, 0x4ecdc4, 0x45b7d1, 0x96ceb4, 0xffeaa7, 0x888888];
                    const color = colors[(meshCount - 1) % colors.length];
                    
                    material = new THREE.MeshStandardMaterial({
                      color: color,
                      roughness: 0.6,
                      metalness: 0.1
                    });
                    console.log(`Colored material applied to mesh ${meshCount} (color: ${color.toString(16)})`);
                  }
                  
                  child.material = material;
                  
                } catch (materialError) {
                  console.error(`Error processing material for mesh ${meshCount}:`, materialError);
                }
              }
            });
            
            console.log(`Mesh traversal complete - processed ${meshCount} meshes`);
            
          } catch (traversalError) {
            console.error('Error during mesh traversal:', traversalError);
          }
          
          try {
            console.log('Adding model to scene...');
            scene.add(model);
            console.log('Model added to scene successfully');
            
            // Calculate and log model bounds for debugging
            console.log('Calculating model bounds...');
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            
            console.log('Model bounds:', {
              size: { x: size.x.toFixed(2), y: size.y.toFixed(2), z: size.z.toFixed(2) },
              center: { x: center.x.toFixed(2), y: center.y.toFixed(2), z: center.z.toFixed(2) }
            });
            
            // Adjust camera position if model is very large or small
            const maxDimension = Math.max(size.x, size.y, size.z);
            if (maxDimension > 10) {
              camera.position.set(0, maxDimension * 0.5, maxDimension * 1.5);
              console.log('Adjusted camera for large model:', camera.position);
            } else if (maxDimension < 1) {
              camera.position.set(0, 1, 2);
              console.log('Adjusted camera for small model:', camera.position);
            }
            
            // Create static physics body for the model (mass = 0 makes it static)
            console.log('Creating physics body...');
            const shape = new CANNON.Box(new CANNON.Vec3(1, 1, 1));
            modelBody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
            modelBody.addShape(shape);
            modelBody.position.set(0, 0, 0); // Static position
            world.addBody(modelBody);
            console.log('Physics body created and added');
            
          } catch (sceneError) {
            console.error('Error adding model to scene or calculating bounds:', sceneError);
          }
          
          console.log('GLTF model loaded successfully');
        } catch (error) {
          console.error('Error loading GLTF model:', error);
          
          // Fallback: create a static cube if model fails to load
          const geometry = new THREE.BoxGeometry();
          const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
          model = new THREE.Mesh(geometry, material);
          model.position.set(0, 0, 0);
          scene.add(model);
          
          const shape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
          modelBody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
          modelBody.addShape(shape);
          modelBody.position.set(0, 0, 0);
          world.addBody(modelBody);
        }

        console.log('Setting up animation loop...');
        const clock = new THREE.Clock();

        const animate = () => {
          requestAnimationFrame(animate);
          const delta = clock.getDelta();
          world.step(delta);

          // Model is static, no need to update position from physics body
          // The model stays at its original position (0, 0, 0)

          renderer.render(scene, camera);
          gl.endFrameEXP();
        };
        
        console.log('Starting animation...');
        animate();
        console.log('Animation loop started');
      }}
    />
  );
}

