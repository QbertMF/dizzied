import { Accelerometer } from 'expo-sensors'; // Removed due to vulnerabilities
import * as THREE from 'three';

/**
 * AccelerometerManager - Manages device accelerometer for physics control
 */
export class AccelerometerManager {
  constructor(options = {}) {
    // Configuration
    this.sensitivity = options.sensitivity || 4.0; // Gravity multiplier - increased for higher responsiveness
    this.updateInterval = options.updateInterval || 16; // ~60fps
    this.smoothingFactor = options.smoothingFactor || 0.1; // Low-pass filter
    this.maxGravity = options.maxGravity || 20; // Maximum gravity magnitude - increased for stronger effect
    
    // State
    this.isActive = false;
    this.referenceVector = new THREE.Vector3(0, -9.82, 0); // Default gravity
    this.currentAcceleration = new THREE.Vector3(0, 0, 0);
    this.smoothedAcceleration = new THREE.Vector3(0, 0, 0);
    this.gravityVector = new THREE.Vector3(0, -9.82, 0);
    
    // Callbacks
    this.onGravityChange = null;
    
    // Subscription
    this.subscription = null;
    
    console.log('AccelerometerManager initialized:', {
      sensitivity: this.sensitivity,
      updateInterval: this.updateInterval,
      smoothingFactor: this.smoothingFactor,
      maxGravity: this.maxGravity
    });
  }

  /**
   * Check if accelerometer is available on device
   */
  async isAvailable() {
    try {
      const available = await Accelerometer.isAvailableAsync();
      console.log('Accelerometer available:', available);
      return available;
    } catch (error) {
      console.error('Error checking accelerometer availability:', error);
      return false;
    }
  }

  /**
   * Start accelerometer monitoring and calibrate reference
   */
  async start() {
    try {
      const available = await this.isAvailable();
      if (!available) {
        console.warn('Accelerometer not available on this device');
        return false;
      }

      console.log('Starting accelerometer calibration...');
      
      // Set update interval
      Accelerometer.setUpdateInterval(this.updateInterval);
      
      // Calibrate reference and start monitoring
      await this.calibrateReference();
      
      // Start continuous monitoring
      this.subscription = Accelerometer.addListener(this.handleAccelerometerUpdate.bind(this));
      
      this.isActive = true;
      console.log('AccelerometerManager started successfully');
      console.log('Reference vector:', this.referenceVector);
      
      return true;
    } catch (error) {
      console.error('Failed to start AccelerometerManager:', error);
      return false;
    }
  }

  /**
   * Stop accelerometer monitoring
   */
  stop() {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }
    
    this.isActive = false;
    console.log('AccelerometerManager stopped');
  }

  /**
   * Calibrate reference vector by averaging initial readings
   */
  async calibrateReference() {
    return new Promise((resolve) => {
      console.log('Calibrating accelerometer reference...');
      
      let sampleCount = 0;
      const totalSamples = 30; // Number of samples for calibration
      const accumulatedVector = new THREE.Vector3(0, 0, 0);
      
      const calibrationSubscription = Accelerometer.addListener((data) => {
        sampleCount++;
        
        // Accumulate readings
        accumulatedVector.x += data.x;
        accumulatedVector.y += data.y; 
        accumulatedVector.z += data.z; // Keep Z axis consistent with handleAccelerometerUpdate
        
        console.log(`Calibration sample ${sampleCount}/${totalSamples}: x=${data.x.toFixed(3)}, y=${data.y.toFixed(3)}, z=${data.z.toFixed(3)}`);
        
        if (sampleCount >= totalSamples) {
          // Calculate average
          this.referenceVector.set(
            accumulatedVector.x / totalSamples,
            accumulatedVector.y / totalSamples,
            accumulatedVector.z / totalSamples
          );
          
          // Clean up calibration subscription
          calibrationSubscription.remove();
          
          console.log('Calibration complete! Reference vector:', {
            x: this.referenceVector.x.toFixed(3),
            y: this.referenceVector.y.toFixed(3),
            z: this.referenceVector.z.toFixed(3)
          });
          
          resolve();
        }
      });
    });
  }

  /**
   * Handle accelerometer data and update gravity
   */
  handleAccelerometerUpdate(data) {
    if (!this.isActive) return;

    // Convert device coordinates to game coordinates
    this.currentAcceleration.set(
      data.x,
      data.y,
      data.z // Keep Z axis consistent
    );

    // Apply smoothing (low-pass filter)
    this.smoothedAcceleration.lerp(this.currentAcceleration, this.smoothingFactor);

    // Calculate gravity vector relative to reference
    const deltaAcceleration = this.smoothedAcceleration.clone().sub(this.referenceVector);
    
    // Apply sensitivity and create gravity vector
    // Fix axis mapping for intuitive phone tilting (tilt right = ball rolls right, tilt away = ball rolls away)
    this.gravityVector.set(
      -deltaAcceleration.x * this.sensitivity, // Flip X: tilt right = ball moves right
      this.referenceVector.y - (deltaAcceleration.y * this.sensitivity * 0.5), // Less Y sensitivity
      -deltaAcceleration.z * this.sensitivity  // Reverse Z: tilt away = ball moves toward you (reversed)
    );

    // Clamp gravity magnitude
    if (this.gravityVector.length() > this.maxGravity) {
      this.gravityVector.normalize().multiplyScalar(this.maxGravity);
    }

    // Ensure minimum downward gravity (so objects don't float)
    if (this.gravityVector.y > -1) {
      this.gravityVector.y = -1;
    }

    // Notify callback if set
    if (this.onGravityChange) {
      this.onGravityChange(this.gravityVector.clone());
    }
  }

  /**
   * Reset reference vector to current phone position (instant recalibration)
   */
  resetReference() {
    if (this.isActive && this.smoothedAcceleration) {
      this.referenceVector.copy(this.smoothedAcceleration);
      console.log('Reference vector reset to current position:', {
        x: this.referenceVector.x.toFixed(3),
        y: this.referenceVector.y.toFixed(3),
        z: this.referenceVector.z.toFixed(3)
      });
    } else {
      console.warn('Cannot reset reference - accelerometer not active or no data available');
    }
  }

  /**
   * Get current gravity vector
   */
  getGravityVector() {
    return this.gravityVector.clone();
  }

  /**
   * Get current acceleration data
   */
  getAccelerationData() {
    return {
      current: this.currentAcceleration.clone(),
      smoothed: this.smoothedAcceleration.clone(),
      reference: this.referenceVector.clone(),
      gravity: this.gravityVector.clone(),
      isActive: this.isActive
    };
  }

  /**
   * Set gravity change callback
   */
  setGravityChangeCallback(callback) {
    this.onGravityChange = callback;
  }

  /**
   * Recalibrate reference vector
   */
  async recalibrate() {
    if (this.isActive) {
      console.log('Recalibrating accelerometer...');
      await this.calibrateReference();
    }
  }

  /**
   * Update sensitivity
   */
  setSensitivity(sensitivity) {
    this.sensitivity = Math.max(0.1, Math.min(10.0, sensitivity));
    console.log('AccelerometerManager sensitivity set to:', this.sensitivity);
  }

  /**
   * Update smoothing factor
   */
  setSmoothingFactor(factor) {
    this.smoothingFactor = Math.max(0.01, Math.min(1.0, factor));
    console.log('AccelerometerManager smoothing factor set to:', this.smoothingFactor);
  }

  /**
   * Reset to default gravity
   */
  resetGravity() {
    this.gravityVector.set(0, -9.82, 0);
    if (this.onGravityChange) {
      this.onGravityChange(this.gravityVector.clone());
    }
  }

  /**
   * Get status information
   */
  getStatus() {
    return {
      isActive: this.isActive,
      sensitivity: this.sensitivity,
      smoothingFactor: this.smoothingFactor,
      maxGravity: this.maxGravity,
      currentGravity: {
        x: this.gravityVector.x.toFixed(2),
        y: this.gravityVector.y.toFixed(2),
        z: this.gravityVector.z.toFixed(2),
        magnitude: this.gravityVector.length().toFixed(2)
      },
      reference: {
        x: this.referenceVector.x.toFixed(2),
        y: this.referenceVector.y.toFixed(2),
        z: this.referenceVector.z.toFixed(2)
      }
    };
  }

  /**
   * Cleanup
   */
  cleanup() {
    this.stop();
    console.log('AccelerometerManager cleanup complete');
  }
}

// Export singleton instance
export const accelerometerManager = new AccelerometerManager({
  sensitivity: 5.0, // Increased for higher responsiveness to phone movements
  updateInterval: 16, // ~60fps
  smoothingFactor: 0.12, // Slightly reduced for more immediate response
  maxGravity: 25 // Increased maximum for stronger effect
});