import React from 'react';
import { View } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { assetManager } from './src/AssetManager';
import { inputManager } from './src/InputManager';

export default function App() {
  console.log('App component started');

  // Setup input handlers
  React.useEffect(() => {
    // Register input event handlers
    const tapHandler = inputManager.on('tap', (eventData) => {
      console.log('Tap detected at:', eventData.position);
      // You can add game logic here, like spawning objects at tap location
    });

    const pressHandler = inputManager.on('press', (eventData) => {
      console.log('Touch pressed at:', eventData.position);
    });

    const moveHandler = inputManager.on('move', (eventData) => {
      // Uncomment to see movement (can be spammy)
      // console.log('Touch moved, delta:', eventData.delta);
    });

    // Cleanup on unmount
    return () => {
      inputManager.off('tap', tapHandler);
      inputManager.off('press', pressHandler);
      inputManager.off('move', moveHandler);
    };
  }, []);
  
  return (
    <View style={{ flex: 1 }}>
      <GLView
        style={{ flex: 1 }}
        {...inputManager.createTouchHandlers()}
        onContextCreate={async (gl) => {
          console.log('GLView context created');
          
          // Declare all variables at the top level
          let renderer, scene, camera, world, model = null, modelBody = null;
          
          try {
            console.log('Initializing 3D scene...');
            renderer = new Renderer({ gl });
            renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);

            scene = new THREE.Scene();
            camera = new THREE.PerspectiveCamera(75, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 1000);
            camera.position.set(0, 2, 5);

            // Add lighting
            const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
            scene.add(ambientLight);
            
            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(10, 10, 5);
            scene.add(directionalLight);

            // Physics setup
            world = new CANNON.World();
            world.gravity.set(0, -9.82, 0);
            
            console.log('3D scene initialized successfully');
          } catch (setupError) {
            console.error('Error during 3D setup:', setupError);
            return;
          }
        
        try {
          // Set GL context for AssetManager texture loading
          console.log('Setting GL context for AssetManager...');
          assetManager.setGLContext(gl);
          
          // Load level using AssetManager - much simpler!
          console.log('Loading level with AssetManager...');
          model = await assetManager.loadLevel('level2.glb', 'block01.png', 'currentLevel');
          
          if (!model) {
            throw new Error('Failed to load level');
          }
          
          // Set model transform
          model.scale.set(1, 1, 1);
          model.position.set(0, 0, 0);
          console.log('Level loaded and configured successfully');
          
          // Add model to scene
          console.log('Adding model to scene...');
          scene.add(model);
          
          // Calculate bounds and adjust camera
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const maxDimension = Math.max(size.x, size.y, size.z);
          
          if (maxDimension > 10) {
            camera.position.set(0, maxDimension * 0.5, maxDimension * 1.5);
          } else if (maxDimension < 1) {
            camera.position.set(0, 1, 2);
          }
          
          // Create static physics body
          const shape = new CANNON.Box(new CANNON.Vec3(1, 1, 1));
          modelBody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
          modelBody.addShape(shape);
          modelBody.position.set(0, 0, 0);
          world.addBody(modelBody);
          
          console.log('Level setup complete');
          
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
    </View>
  );
}

