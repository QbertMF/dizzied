import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { assetManager } from './src/AssetManager';
import { inputManager } from './src/InputManager';

export default function App() {
  console.log('App component started');
  
  // State for FPS display
  const [fps, setFps] = React.useState(0);

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
          let sphere = null, sphereBody = null;
          
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

            // Physics setup with performance optimizations
            world = new CANNON.World();
            world.gravity.set(0, -9.82, 0);
            
            // Use SAPBroadphase for better performance with many objects
            world.broadphase = new CANNON.SAPBroadphase(world);
            
            // Optimize solver for performance
            world.solver.iterations = 5; // Reduced from 10
            world.solver.tolerance = 0.1;
            
            // Allow sleeping for static and slow-moving bodies (performance boost)
            world.allowSleep = true;
            world.sleepSpeedLimit = 0.1; // Bodies slower than this will sleep
            world.sleepTimeLimit = 1; // Bodies must be slow for 1 second to sleep
            
            console.log('Physics world initialized with gravity:', world.gravity);
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
          
          console.log('Model bounding box size:', size);
          console.log('Max dimension:', maxDimension);
          
          if (maxDimension > 10) {
            camera.position.set(0, maxDimension * 0.5, maxDimension * 1.5);
          } else if (maxDimension < 1) {
            camera.position.set(0, 1, 2);
          }
          
          // Make sure camera is looking at the center where our sphere will be
          camera.lookAt(0, 0.5, 0); // Look at a point slightly above ground
          console.log('Camera positioned at:', camera.position);
          console.log('Camera looking at: (0, 0.5, 0)');
          
          // Create optimized physics bodies from GLTF meshes
          console.log('Creating optimized physics collision from GLTF meshes...');
          
          const levelBodies = [];
          let meshCount = 0;
          let physicsBodyCount = 0;
          const MIN_SIZE_THRESHOLD = 0.1; // Ignore very small objects
          const MAX_PHYSICS_BODIES = 20; // Limit total physics bodies for performance
          
          // Traverse the GLTF model to find suitable meshes for physics
          model.traverse((child) => {
            if (child.isMesh && child.geometry && physicsBodyCount < MAX_PHYSICS_BODIES) {
              meshCount++;
              
              try {
                // Get the geometry and compute bounding box
                const geometry = child.geometry;
                geometry.computeBoundingBox();
                const bbox = geometry.boundingBox;
                
                if (bbox) {
                  // Calculate size and center of the bounding box
                  const size = new THREE.Vector3();
                  bbox.getSize(size);
                  const center = new THREE.Vector3();
                  bbox.getCenter(center);
                  
                  // Skip very small objects (details, decorations)
                  const minDimension = Math.min(size.x, size.y, size.z);
                  const maxDimension = Math.max(size.x, size.y, size.z);
                  
                  if (minDimension < MIN_SIZE_THRESHOLD) {
                    console.log(`Skipping small mesh ${meshCount}: ${child.name || 'unnamed'} (size: ${minDimension.toFixed(2)})`);
                    return;
                  }
                  
                  // Prioritize larger, more important objects for physics
                  const isImportant = 
                    child.name?.toLowerCase().includes('floor') ||
                    child.name?.toLowerCase().includes('ground') ||
                    child.name?.toLowerCase().includes('wall') ||
                    child.name?.toLowerCase().includes('platform') ||
                    maxDimension > 1.0; // Large objects are usually important
                  
                  if (!isImportant && physicsBodyCount > 10) {
                    console.log(`Skipping non-essential mesh ${meshCount}: ${child.name || 'unnamed'} (prioritizing performance)`);
                    return;
                  }
                  
                  physicsBodyCount++;
                  console.log(`Creating physics body ${physicsBodyCount} for mesh ${meshCount}: ${child.name || 'unnamed'}`);
                  
                  // Create a physics body with a box shape matching the mesh bounds
                  const halfExtents = new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2);
                  const shape = new CANNON.Box(halfExtents);
                  
                  const body = new CANNON.Body({ 
                    mass: 0, // Static body
                    type: CANNON.Body.KINEMATIC 
                  });
                  body.addShape(shape);
                  
                  // Apply the mesh's world transform to the physics body
                  const worldPosition = new THREE.Vector3();
                  const worldQuaternion = new THREE.Quaternion();
                  const worldScale = new THREE.Vector3();
                  
                  child.getWorldPosition(worldPosition);
                  child.getWorldQuaternion(worldQuaternion);
                  child.getWorldScale(worldScale);
                  
                  // Set physics body position (center + world position)
                  body.position.set(
                    worldPosition.x + center.x * worldScale.x,
                    worldPosition.y + center.y * worldScale.y,
                    worldPosition.z + center.z * worldScale.z
                  );
                  
                  // Set physics body rotation
                  body.quaternion.set(
                    worldQuaternion.x,
                    worldQuaternion.y,
                    worldQuaternion.z,
                    worldQuaternion.w
                  );
                  
                  world.addBody(body);
                  levelBodies.push(body);
                  
                  console.log(`Created physics body for mesh ${meshCount}:`, {
                    name: child.name || 'unnamed',
                    size: { x: size.x.toFixed(2), y: size.y.toFixed(2), z: size.z.toFixed(2) },
                    position: { 
                      x: body.position.x.toFixed(2), 
                      y: body.position.y.toFixed(2), 
                      z: body.position.z.toFixed(2) 
                    }
                  });
                }
              } catch (error) {
                console.error(`Failed to create physics body for mesh ${meshCount}:`, error);
              }
            }
          });
          
          console.log(`Created ${levelBodies.length} physics bodies from ${meshCount} meshes (optimized for performance)`);
          
          // Store reference to the first body as modelBody for compatibility
          modelBody = levelBodies.length > 0 ? levelBodies[0] : null;
          
          console.log('Level setup complete');
          
          // Create physics sphere
          console.log('Creating physics sphere...');
          const sphereGeometry = new THREE.SphereGeometry(1.0, 32, 24); // Match physics body size
          const sphereMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xff0000, // Bright red
            roughness: 0.1,
            metalness: 0.0,
            emissive: 0x330000 // Add slight glow
          });
          sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
          sphere.position.set(0, 5, 0); // Start higher up to see the fall
          console.log('Visual sphere created at position:', sphere.position);
          console.log('Sphere added to scene, scene children count:', scene.children.length);
          scene.add(sphere);
          console.log('After adding sphere, scene children count:', scene.children.length);
          
          // Create physics body for sphere
          const sphereShape = new CANNON.Sphere(1.0); // Same radius as geometry
          sphereBody = new CANNON.Body({ 
            mass: 1, // Has mass, so it's affected by gravity
            type: CANNON.Body.DYNAMIC 
          });
          sphereBody.addShape(sphereShape);
          
          // Set position using Vec3 instead of set method
          sphereBody.position = new CANNON.Vec3(0, 5, 0); // Start higher up to see the fall
          sphereBody.velocity = new CANNON.Vec3(0, 0, 0); // Initialize velocity
          sphereBody.angularVelocity = new CANNON.Vec3(0, 0, 0); // Initialize angular velocity
          
          // Create physics materials for better collision interaction
          const spherePhysicsMaterial = new CANNON.Material('sphereMaterial');
          const groundPhysicsMaterial = new CANNON.Material('groundMaterial');
          
          // Create contact material
          const sphereGroundContact = new CANNON.ContactMaterial(
            spherePhysicsMaterial,
            groundPhysicsMaterial,
            {
              friction: 0.4,
              restitution: 0.7 // Bounciness
            }
          );
          
          world.addContactMaterial(sphereGroundContact);
          
          sphereBody.material = spherePhysicsMaterial;
          
          // Apply ground material to all level bodies
          levelBodies.forEach(body => {
            body.material = groundPhysicsMaterial;
          });
          
          console.log('Physics sphere body created with position:', sphereBody.position);
          console.log('Adding sphere body to world...');
          world.addBody(sphereBody);
          
          console.log('Physics sphere created and added to world');
          console.log(`Initial sphere position: x=${sphereBody.position.x}, y=${sphereBody.position.y}, z=${sphereBody.position.z}`);
          
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
        let frameCount = 0;
        
        // FPS calculation variables
        let lastTime = performance.now();
        let frameTimeSum = 0;
        let fpsFrameCount = 0;

        const animate = () => {
          requestAnimationFrame(animate);
          
          // Calculate FPS
          const currentTime = performance.now();
          const frameTime = currentTime - lastTime;
          lastTime = currentTime;
          
          frameTimeSum += frameTime;
          fpsFrameCount++;
          
          // Update FPS display every 30 frames (about twice per second)
          if (fpsFrameCount >= 30) {
            const avgFrameTime = frameTimeSum / fpsFrameCount;
            const currentFps = Math.round(1000 / avgFrameTime);
            setFps(currentFps);
            frameTimeSum = 0;
            fpsFrameCount = 0;
          }
          
          const delta = clock.getDelta();
          
          // Use fixed timestep to prevent instability
          const fixedTimeStep = 1.0 / 60.0; // 60 FPS
          const maxSubSteps = 3;
          world.step(fixedTimeStep, delta, maxSubSteps);

          // Update sphere position from physics body
          if (sphere && sphereBody) {
            // Check for NaN values before copying
            if (!isNaN(sphereBody.position.x) && !isNaN(sphereBody.position.y) && !isNaN(sphereBody.position.z)) {
              sphere.position.copy(sphereBody.position);
              sphere.quaternion.copy(sphereBody.quaternion);
            } else {
              console.error('NaN detected in sphere physics body position!');
              console.error('Position:', sphereBody.position);
              console.error('Velocity:', sphereBody.velocity);
              console.error('World gravity:', world.gravity);
              // Reset the sphere body to prevent further NaN propagation
              sphereBody.position = new CANNON.Vec3(0, 1, 0);
              sphereBody.velocity = new CANNON.Vec3(0, 0, 0);
            }
            
            // Log sphere position every 60 frames (roughly once per second at 60fps)
            frameCount++;
            if (frameCount % 60 === 0) {
              console.log(`Physics body position: x=${sphereBody.position.x.toFixed(2)}, y=${sphereBody.position.y.toFixed(2)}, z=${sphereBody.position.z.toFixed(2)}`);
              console.log(`Visual sphere position: x=${sphere.position.x.toFixed(2)}, y=${sphere.position.y.toFixed(2)}, z=${sphere.position.z.toFixed(2)}`);
              console.log(`Sphere velocity: x=${sphereBody.velocity.x.toFixed(2)}, y=${sphereBody.velocity.y.toFixed(2)}, z=${sphereBody.velocity.z.toFixed(2)}`);
              console.log(`Camera position: x=${camera.position.x.toFixed(2)}, y=${camera.position.y.toFixed(2)}, z=${camera.position.z.toFixed(2)}`);
              console.log(`Delta time: ${delta.toFixed(4)}`);
            }
          }

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
      
      {/* FPS Counter Overlay */}
      <View style={styles.fpsContainer}>
        <Text style={styles.fpsText}>FPS: {fps}</Text>
      </View>
    </View>
  );
}

// Styles for FPS display
const styles = StyleSheet.create({
  fpsContainer: {
    position: 'absolute',
    top: 40,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    zIndex: 1000,
  },
  fpsText: {
    color: '#00ff00',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
});

