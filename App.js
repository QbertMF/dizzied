import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { GLView } from 'expo-gl';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { assetManager } from './src/AssetManager';
import { inputManager } from './src/InputManager';
import { physicsManager } from './src/PhysicsManager';
import { accelerometerManager } from './src/AccelerometerManager';
import { levelManager } from './src/LevelManager';

// Rebuilt 3D app without expo-three dependency
export default function App() {
  // FPS and performance state
  const [fps, setFps] = React.useState(0);
  const [physicsStats, setPhysicsStats] = React.useState({
    totalChunks: 0,
    loadedChunks: 0,
    totalTrimeshes: 0,
    loadedTrimeshes: 0,
    spherePosition: { x: 0, y: 0, z: 0 },
    sphereVelocity: { x: 0, y: 0, z: 0 }
  });

  // Accelerometer state
  const [accelerometerActive, setAccelerometerActive] = React.useState(false);
  
  // Refs to avoid re-renders
  const fpsRef = React.useRef(0);
  const frameCountRef = React.useRef(0);
  const lastTimeRef = React.useRef(performance.now());
  
  // Physics objects refs for reset functionality
  const sphereBodyRef = React.useRef(null);
  const sphereRef = React.useRef(null);
  const worldRef = React.useRef(null); // Store world reference for gravity updates
  
  // Define initial sphere position
  const INITIAL_SPHERE_POSITION = { x: 0, y: 10, z: 0 }; // Higher up position
  
  // Setup input handlers and cleanup
  React.useEffect(() => {
    console.log('App component mounted - setting up managers');
    
    // Register input event handlers
    const tapHandler = inputManager.on('tap', (eventData) => {
      console.log('Tap detected at:', eventData.position);
    });

    const pressHandler = inputManager.on('press', (eventData) => {
      console.log('Touch pressed at:', eventData.position);
    });

    // Cleanup on unmount
    return () => {
      console.log('App component unmounting - cleaning up managers');
      inputManager.off('tap', tapHandler);
      inputManager.off('press', pressHandler);
      accelerometerManager.cleanup();
    };
  }, []);
  
  const onContextCreate = async (gl) => {
    console.log('GL context created - rebuilding 3D scene without expo-three');
    
    try {
      // Create Three.js renderer manually (without expo-three's Renderer)
      const renderer = new THREE.WebGLRenderer({
        canvas: {
          width: gl.drawingBufferWidth,
          height: gl.drawingBufferHeight,
          style: {},
          addEventListener: () => {},
          removeEventListener: () => {},
          clientHeight: gl.drawingBufferHeight,
        },
        context: gl,
        alpha: false,
        antialias: true,
      });
      
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderer.setClearColor(0x000033, 1.0); // Dark blue to see if GL is working
      renderer.setPixelRatio(1);
      
      console.log('Renderer created:', {
        width: gl.drawingBufferWidth,
        height: gl.drawingBufferHeight
      });
      
      // Create physics world with optimized settings
      const world = new CANNON.World();
      world.gravity.set(0, -9.82, 0);
      world.broadphase = new CANNON.NaiveBroadphase();
      
      // Optimize solver for performance
      world.solver.iterations = 5; // Reduced from 10
      world.solver.tolerance = 0.1;
      
      // Allow sleeping for static and slow-moving bodies (performance boost)
      world.allowSleep = true;
      world.sleepSpeedLimit = 0.1; // Bodies slower than this will sleep
      world.sleepTimeLimit = 1; // Bodies must be slow for 1 second to sleep
      
      // Store world reference for managers
      worldRef.current = world;
      
      // Initialize accelerometer for gravity control
      console.log('Initializing accelerometer...');
      accelerometerManager.setGravityChangeCallback((newGravity) => {
        if (worldRef.current) {
          worldRef.current.gravity.set(newGravity.x, newGravity.y, newGravity.z);
        }
      });
      
      // Start accelerometer (async)
      accelerometerManager.start().then((started) => {
        setAccelerometerActive(started);
        if (started) {
          console.log('Accelerometer started successfully - tilt phone to control gravity!');
        } else {
          console.log('Accelerometer not available - using default gravity');
        }
      });
      
      console.log('Physics world initialized with gravity:', world.gravity);
      
      // Create scene
      const scene = new THREE.Scene();
      
      // Create camera  
      const camera = new THREE.PerspectiveCamera(
        75,
        gl.drawingBufferWidth / gl.drawingBufferHeight,
        0.1,
        1000
      );
      camera.position.set(0, 10, 15);
      camera.lookAt(0, 0, 0);
      
      // Add lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
      scene.add(ambientLight);
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(10, 10, 5);
      directionalLight.castShadow = true;
      scene.add(directionalLight);
      
      let model = null;
      let sphere = null;
      let sphereBody = null;
      
      // Create a procedural level instead of loading GLTF (more reliable)
      console.log('Creating procedural level geometry...');
      
      try {
        model = new THREE.Group();
        model.name = 'ProceduralLevel';
        
        // Create a more interesting level with multiple platforms and obstacles
        const levelGeometries = [];
        
        // Main ground platform
        const mainGround = new THREE.Mesh(
          new THREE.BoxGeometry(20, 1, 20),
          new THREE.MeshLambertMaterial({ color: 0x4a7c59 })
        );
        mainGround.position.set(0, -0.5, 0);
        model.add(mainGround);
        levelGeometries.push({ mesh: mainGround, isStatic: true });
        
        // Elevated platforms
        const platforms = [
          { pos: [6, 2, 6], size: [4, 0.5, 4], color: 0x8B4513 },
          { pos: [-6, 3, -6], size: [3, 0.5, 3], color: 0x8B4513 },
          { pos: [0, 4, -10], size: [6, 0.5, 2], color: 0x8B4513 },
          { pos: [10, 1, 0], size: [2, 0.5, 8], color: 0x8B4513 }
        ];
        
        platforms.forEach((platform, index) => {
          const platformMesh = new THREE.Mesh(
            new THREE.BoxGeometry(...platform.size),
            new THREE.MeshLambertMaterial({ color: platform.color })
          );
          platformMesh.position.set(...platform.pos);
          platformMesh.name = `Platform_${index}`;
          model.add(platformMesh);
          levelGeometries.push({ mesh: platformMesh, isStatic: true });
        });
        
        // Walls around the level
        const walls = [
          { pos: [0, 3, 12], size: [20, 6, 1], color: 0x696969 },  // North wall
          { pos: [0, 3, -12], size: [20, 6, 1], color: 0x696969 }, // South wall
          { pos: [12, 3, 0], size: [1, 6, 20], color: 0x696969 },  // East wall
          { pos: [-12, 3, 0], size: [1, 6, 20], color: 0x696969 }  // West wall
        ];
        
        walls.forEach((wall, index) => {
          const wallMesh = new THREE.Mesh(
            new THREE.BoxGeometry(...wall.size),
            new THREE.MeshLambertMaterial({ color: wall.color })
          );
          wallMesh.position.set(...wall.pos);
          wallMesh.name = `Wall_${index}`;
          model.add(wallMesh);
          levelGeometries.push({ mesh: wallMesh, isStatic: true });
        });
        
        // Add some obstacles/ramps
        const obstacles = [
          { pos: [-3, 1, 3], size: [2, 2, 2], color: 0xDC143C },
          { pos: [8, 0.5, -4], size: [1, 1, 6], color: 0xFF6347 },
          { pos: [-8, 1.5, -2], size: [3, 3, 1], color: 0x4169E1 }
        ];
        
        obstacles.forEach((obstacle, index) => {
          const obstacleMesh = new THREE.Mesh(
            new THREE.BoxGeometry(...obstacle.size),
            new THREE.MeshLambertMaterial({ color: obstacle.color })
          );
          obstacleMesh.position.set(...obstacle.pos);
          obstacleMesh.name = `Obstacle_${index}`;
          model.add(obstacleMesh);
          levelGeometries.push({ mesh: obstacleMesh, isStatic: true });
        });
        
        // Add the level to scene
        scene.add(model);
        
        console.log('Procedural level created:', {
          totalMeshes: model.children.length,
          platforms: platforms.length,
          walls: walls.length,
          obstacles: obstacles.length
        });
        
        // Add LevelManager geometry on top of existing level
        try {
          console.log('Creating LevelManager example level...');
          await levelManager.initialize();
          const levelManagerGeometry = levelManager.createExampleLevel();
          
          if (levelManagerGeometry && levelManagerGeometry.children.length > 0) {
            // Position the LevelManager level in the center
            levelManagerGeometry.position.set(-1, 4, 0); // Centered and above existing level
            scene.add(levelManagerGeometry);
            
            console.log('LevelManager level added:', {
              blocks: levelManagerGeometry.children.length,
              position: { x: 0, y: 4, z: 0 }
            });
            
            // Also add physics for the LevelManager geometry
            const levelManagerBodies = levelManager.createTrimesh();
            levelManagerBodies.forEach(body => {
              // Offset physics bodies to match geometry position
              body.position.x += -1;  // Centered
              body.position.y += 4;  // 4 units above ground
              body.position.z += 0;  // Centered
              world.addBody(body);
            });
            
            console.log(`Added ${levelManagerBodies.length} physics bodies for LevelManager level`);
          } else {
            console.warn('LevelManager geometry is empty');
          }
        } catch (levelManagerError) {
          console.error('Error creating LevelManager level:', levelManagerError);
        }
        
        // Initialize PhysicsManager with the procedural level
        console.log('Initializing PhysicsManager with procedural geometry...');
        physicsManager.setWorld(world);
        physicsManager.processGeometry(model);
        
        console.log('PhysicsManager initialized successfully with procedural level');
        
      } catch (levelError) {
        console.error('Error creating procedural level:', levelError);
        
        // Ultimate fallback: single ground plane
        const groundGeometry = new THREE.PlaneGeometry(20, 20);
        const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x90EE90 });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        scene.add(ground);
        
        // Create simple physics ground
        const groundShape = new CANNON.Plane();
        const groundBody = new CANNON.Body({ mass: 0 });
        groundBody.addShape(groundShape);
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(-1, 0, 0), Math.PI * 0.5);
        world.addBody(groundBody);
        
        console.log('Using ultimate fallback: simple ground plane');
      }
      
      // Create physics sphere (ball)
      const sphereRadius = 0.5;
      const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 32, 32);
      const sphereMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xff6347,
        transparent: true,
        opacity: 0.9 
      });
      sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      sphere.position.set(INITIAL_SPHERE_POSITION.x, INITIAL_SPHERE_POSITION.y, INITIAL_SPHERE_POSITION.z);
      sphere.castShadow = true;
      scene.add(sphere);
      
      // Create physics body for sphere
      const sphereShape = new CANNON.Sphere(sphereRadius);
      sphereBody = new CANNON.Body({ 
        mass: 1,
        material: new CANNON.Material({ friction: 0.3, restitution: 0.7 })
      });
      sphereBody.addShape(sphereShape);
      sphereBody.position.set(INITIAL_SPHERE_POSITION.x, INITIAL_SPHERE_POSITION.y, INITIAL_SPHERE_POSITION.z);
      world.addBody(sphereBody);
      
      // Store references for reset functionality
      sphereBodyRef.current = sphereBody;
      sphereRef.current = sphere;
      
      console.log('Sphere references stored for reset functionality:', {
        sphereBodyRef: !!sphereBodyRef.current,
        sphereRef: !!sphereRef.current
      });
      
      console.log('3D scene with physics created:', {
        spherePosition: sphere.position,
        cameraPosition: camera.position,
        sceneChildren: scene.children.length,
        physicsWorld: {
          bodies: world.bodies.length,
          gravity: world.gravity.y
        }
      });
      
      // Animation loop with physics simulation and performance monitoring
      let animationFrame = 0;
      const timeStep = 1 / 60; // 60 FPS physics
      
      const animate = () => {
        const currentTime = performance.now();
        animationFrame++;
        frameCountRef.current++;
        
        try {
          // Step physics simulation
          world.step(timeStep);
          
          // Update PhysicsManager (spatial chunking)
          if (model && physicsManager.world) {
            physicsManager.updateChunks(camera.position);
          }
          
          // Sync Three.js objects with physics bodies
          if (sphere && sphereBody) {
            sphere.position.copy(sphereBody.position);
            sphere.quaternion.copy(sphereBody.quaternion);
            
            // Add some rotation for visual effect (independent of physics)
            sphere.rotation.x += 0.01;
            
            // Camera follows the sphere
            const targetCameraPosition = new THREE.Vector3(
              sphereBody.position.x + 0,
              sphereBody.position.y + 10,  // 10 units above the sphere
              sphereBody.position.z + 15   // 15 units behind the sphere
            );
            camera.position.lerp(targetCameraPosition, 0.05);
            //camera.lookAt(sphereBody.position);
            
            // Reset sphere if it falls too low (for continuous demo)
            if (sphereBody.position.y < -10) {
              sphereBody.position.set(
                (Math.random() - 0.5) * 8, // Random X position
                INITIAL_SPHERE_POSITION.y, 
                (Math.random() - 0.5) * 8  // Random Z position
              );
              sphereBody.velocity.set(0, 0, 0);
              sphereBody.angularVelocity.set(0, 0, 0);
            }
          }
          
          // Calculate FPS every second
          if (currentTime - lastTimeRef.current >= 1000) {
            const currentFps = Math.round((frameCountRef.current * 1000) / (currentTime - lastTimeRef.current));
            fpsRef.current = currentFps;
            setFps(currentFps);
            frameCountRef.current = 0;
            lastTimeRef.current = currentTime;
          }
          
          // Update physics stats every 30 frames
          if (animationFrame % 30 === 0) {
            const stats = physicsManager.world ? physicsManager.getStatus() : {
              totalChunks: 0,
              loadedChunks: 0,
              totalTrimeshes: 0,
              loadedTrimeshes: 0
            };
            
            setPhysicsStats({
              totalChunks: stats.totalChunks,
              loadedChunks: stats.loadedChunks,
              totalTrimeshes: 0, // Not available in current API
              loadedTrimeshes: 0, // Not available in current API
              spherePosition: sphereBody ? {
                x: parseFloat(sphereBody.position.x.toFixed(2)),
                y: parseFloat(sphereBody.position.y.toFixed(2)),
                z: parseFloat(sphereBody.position.z.toFixed(2))
              } : { x: 0, y: 0, z: 0 },
              sphereVelocity: sphereBody ? {
                x: parseFloat(sphereBody.velocity.x.toFixed(2)),
                y: parseFloat(sphereBody.velocity.y.toFixed(2)),
                z: parseFloat(sphereBody.velocity.z.toFixed(2))
              } : { x: 0, y: 0, z: 0 }
            });
          }
          
          // Render
          renderer.render(scene, camera);
          gl.endFrameEXP();
          
          // Log occasionally to verify physics is working
          if (animationFrame % 300 === 0) {
            console.log('Performance:', {
              fps: fpsRef.current,
              frame: animationFrame,
              sphereY: sphereBody.position.y.toFixed(2),
              velocity: sphereBody.velocity.y.toFixed(2)
            });
          }
          
        } catch (renderError) {
          console.error('Render error:', renderError);
        }
        
        requestAnimationFrame(animate);
      };
      
      console.log('Starting physics animation loop...');
      animate();
      
    } catch (error) {
      console.error('Error in 3D setup:', error);
    }
  };

  // Reset sphere to initial position and recalibrate accelerometer
  const resetSphere = async () => {
    console.log('Reset button pressed. Checking sphere objects:', {
      sphereBodyRef: !!sphereBodyRef.current,
      sphereRef: !!sphereRef.current,
      sphereBodyType: sphereBodyRef.current ? typeof sphereBodyRef.current : 'null',
      sphereType: sphereRef.current ? typeof sphereRef.current : 'null'
    });
    
    if (sphereBodyRef.current && sphereRef.current) {
      // Reset physics body position and velocity
      sphereBodyRef.current.position.set(INITIAL_SPHERE_POSITION.x, INITIAL_SPHERE_POSITION.y, INITIAL_SPHERE_POSITION.z);
      sphereBodyRef.current.velocity.set(0, 0, 0);
      sphereBodyRef.current.angularVelocity.set(0, 0, 0);
      
      // Reset visual sphere position
      sphereRef.current.position.set(INITIAL_SPHERE_POSITION.x, INITIAL_SPHERE_POSITION.y, INITIAL_SPHERE_POSITION.z);
      sphereRef.current.quaternion.set(0, 0, 0, 1);
      
      console.log('Sphere reset to initial position');
      
      // Recalibrate accelerometer with current phone position as new reference
      if (accelerometerManager && accelerometerManager.isActive) {
        console.log('Resetting accelerometer reference to current phone position...');
        try {
          accelerometerManager.resetReference();
          console.log('Accelerometer reference reset complete - current phone position is now the neutral reference');
        } catch (error) {
          console.error('Failed to reset accelerometer reference:', error);
        }
      } else {
        console.log('Accelerometer not active - skipping reference reset');
      }
    } else {
      console.warn('Sphere objects not available for reset');
    }
  };

  return (
    <View style={styles.container}>
      <GLView style={styles.glView} onContextCreate={onContextCreate} />
      
      {/* FPS Counter */}
      <View style={styles.fpsCounter}>
        <Text style={styles.fpsText}>{fps} FPS</Text>
      </View>
      
      {/* Physics Statistics */}
      <View style={styles.statsPanel}>
        <Text style={styles.statsTitle}>Physics Manager</Text>
        <Text style={styles.statsText}>Chunks: {physicsStats.loadedChunks}/{physicsStats.totalChunks}</Text>
        <Text style={styles.statsText}>Trimeshes: {physicsStats.loadedTrimeshes}/{physicsStats.totalTrimeshes}</Text>
        <Text style={styles.statsText}>
          Ball: ({physicsStats.spherePosition.x}, {physicsStats.spherePosition.y}, {physicsStats.spherePosition.z})
        </Text>
        <Text style={styles.statsText}>
          Velocity: ({physicsStats.sphereVelocity.x}, {physicsStats.sphereVelocity.y}, {physicsStats.sphereVelocity.z})
        </Text>
        <Text style={styles.statsText}>
          Accelerometer: {accelerometerActive ? 'Active' : 'Disabled'}
        </Text>
      </View>
      
      {/* Title Overlay */}
      <View style={styles.overlay}>
        <Text style={styles.text}>Dizzied - Physics Engine</Text>
      </View>
      
      {/* Reset Button */}
      <TouchableOpacity style={styles.resetButton} onPress={resetSphere}>
        <Text style={styles.resetButtonText}>Reset Sphere</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  glView: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
  },
  text: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 10,
    borderRadius: 5,
    marginBottom: 5,
  },
  fpsCounter: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'rgba(0, 255, 0, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 80,
  },
  fpsText: {
    color: 'black',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  statsPanel: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  statsTitle: {
    color: '#ffff00',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  statsText: {
    color: 'white',
    fontSize: 10,
    marginBottom: 4,
    fontFamily: 'monospace',
    paddingHorizontal: 20,
  },
  resetButton: {
    position: 'absolute',
    top: 150,
    right: 20,
    backgroundColor: 'rgba(255, 99, 71, 0.9)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  resetButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});