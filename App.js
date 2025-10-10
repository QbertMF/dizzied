import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { assetManager } from './src/AssetManager';
import { inputManager } from './src/InputManager';
import { physicsManager } from './src/PhysicsManager';
export default function App() {
  // Use ref for FPS to avoid re-renders
  const fpsRef = React.useRef(0);
  const [fps, setFps] = React.useState(0);
  
  // Physics statistics state
  const [physicsStats, setPhysicsStats] = React.useState({
    totalChunks: 0,
    loadedChunks: 0,
    totalTrimeshes: 0,
    loadedTrimeshes: 0
  });
  
  // Log only on mount, not on every render
  React.useEffect(() => {
    console.log('App component mounted');
  }, []);

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
          
          // Initialize PhysicsManager and process geometry
          console.log('Setting up PhysicsManager...');
          physicsManager.setWorld(world);
          physicsManager.processGeometry(model);
          
          // Create a simple ground plane as fallback for modelBody compatibility
          const groundShape = new CANNON.Box(new CANNON.Vec3(50, 0.1, 50));
          modelBody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
          modelBody.addShape(groundShape);
          modelBody.position.set(0, -1, 0);
          world.addBody(modelBody);
          
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
          
          // Note: PhysicsManager handles materials for level bodies internally
          
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
          
          // Update FPS display every 60 frames (about once per second) to reduce re-renders
          if (fpsFrameCount >= 60) {
            const avgFrameTime = frameTimeSum / fpsFrameCount;
            const currentFps = Math.round(1000 / avgFrameTime);
            
            // Only update state if FPS changed significantly (avoid unnecessary re-renders)
            if (Math.abs(currentFps - fpsRef.current) > 2) {
              fpsRef.current = currentFps;
              setFps(currentFps);
            }
            
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
            
            // Update PhysicsManager with sphere position for chunk loading/unloading
            physicsManager.updateChunks(sphereBody.position);
            
            // Log sphere position every 60 frames (roughly once per second at 60fps)
            frameCount++;
            if (frameCount % 60 === 0) {
              console.log(`Physics body position: x=${sphereBody.position.x.toFixed(2)}, y=${sphereBody.position.y.toFixed(2)}, z=${sphereBody.position.z.toFixed(2)}`);
              console.log(`Visual sphere position: x=${sphere.position.x.toFixed(2)}, y=${sphere.position.y.toFixed(2)}, z=${sphere.position.z.toFixed(2)}`);
              console.log(`Sphere velocity: x=${sphereBody.velocity.x.toFixed(2)}, y=${sphereBody.velocity.y.toFixed(2)}, z=${sphereBody.velocity.z.toFixed(2)}`);
              console.log(`Camera position: x=${camera.position.x.toFixed(2)}, y=${camera.position.y.toFixed(2)}, z=${camera.position.z.toFixed(2)}`);
              console.log(`Delta time: ${delta.toFixed(4)}`);
              
              // Log PhysicsManager status and update stats
              const status = physicsManager.getStatus();
              console.log(`PhysicsManager: ${status.loadedChunks}/${status.totalChunks} chunks loaded`);
              
              // Calculate trimesh statistics
              let totalTrimeshes = 0;
              let loadedTrimeshes = 0;
              
              physicsManager.chunks.forEach(chunk => {
                totalTrimeshes += chunk.trimeshes.length;
                if (chunk.isLoaded) {
                  loadedTrimeshes += chunk.trimeshes.length;
                }
              });
              
              // Update physics stats (only update if values changed to avoid unnecessary re-renders)
              const newStats = {
                totalChunks: status.totalChunks,
                loadedChunks: status.loadedChunks,
                totalTrimeshes: totalTrimeshes,
                loadedTrimeshes: loadedTrimeshes
              };
              
              // Only update if stats have changed
              if (JSON.stringify(newStats) !== JSON.stringify(physicsStats)) {
                setPhysicsStats(newStats);
              }
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
      
      {/* Physics Statistics Overlay */}
      <View style={styles.physicsStatsContainer}>
        <Text style={styles.physicsStatsTitle}>Physics World</Text>
        <Text style={styles.physicsStatsText}>
          Chunks: {physicsStats.loadedChunks}/{physicsStats.totalChunks}
        </Text>
        <Text style={styles.physicsStatsText}>
          Trimeshes: {physicsStats.loadedTrimeshes}/{physicsStats.totalTrimeshes}
        </Text>
      </View>
    </View>
  );
}

// Styles for FPS and Physics stats display
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
  physicsStatsContainer: {
    position: 'absolute',
    top: 90, // Positioned below FPS counter
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    zIndex: 1000,
    minWidth: 150,
  },
  physicsStatsTitle: {
    color: '#ffaa00',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  physicsStatsText: {
    color: '#ffffff',
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
});

