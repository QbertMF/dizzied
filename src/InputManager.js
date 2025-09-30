export class InputManager {
  constructor() {
    this.touchHandlers = new Map();
    this.gestureHandlers = new Map();
    this.isPressed = false;
    this.lastTouchPosition = { x: 0, y: 0 };
    this.currentTouchPosition = { x: 0, y: 0 };
    this.touchStartTime = 0;
  }

  /**
   * Register a callback for different touch events
   * @param {string} eventType - 'tap', 'press', 'release', 'move', 'longpress'
   * @param {Function} callback - Callback function to execute
   * @param {string} id - Unique ID for this handler (optional)
   */
  on(eventType, callback, id = null) {
    const handlerId = id || `${eventType}_${Date.now()}_${Math.random()}`;
    
    if (!this.touchHandlers.has(eventType)) {
      this.touchHandlers.set(eventType, new Map());
    }
    
    this.touchHandlers.get(eventType).set(handlerId, callback);
    console.log(`Registered ${eventType} handler:`, handlerId);
    
    return handlerId;
  }

  /**
   * Unregister a touch event handler
   * @param {string} eventType - Event type
   * @param {string} handlerId - Handler ID returned from on()
   */
  off(eventType, handlerId) {
    if (this.touchHandlers.has(eventType)) {
      this.touchHandlers.get(eventType).delete(handlerId);
      console.log(`Unregistered ${eventType} handler:`, handlerId);
    }
  }

  /**
   * Trigger callbacks for a specific event type
   * @param {string} eventType - Event type to trigger
   * @param {Object} eventData - Data to pass to callbacks
   */
  trigger(eventType, eventData) {
    if (this.touchHandlers.has(eventType)) {
      this.touchHandlers.get(eventType).forEach((callback, id) => {
        try {
          callback(eventData);
        } catch (error) {
          console.error(`Error in ${eventType} handler ${id}:`, error);
        }
      });
    }
  }

  /**
   * Handle touch start event
   * @param {Object} event - Touch event
   */
  handleTouchStart(event) {
    const { locationX, locationY, pageX, pageY } = event.nativeEvent;
    
    this.isPressed = true;
    this.touchStartTime = Date.now();
    this.lastTouchPosition = { x: locationX || pageX, y: locationY || pageY };
    this.currentTouchPosition = { x: locationX || pageX, y: locationY || pageY };

    const eventData = {
      position: this.currentTouchPosition,
      timestamp: this.touchStartTime,
      isPressed: this.isPressed
    };

    this.trigger('press', eventData);
    console.log('Touch started:', eventData);
  }

  /**
   * Handle touch move event
   * @param {Object} event - Touch event
   */
  handleTouchMove(event) {
    if (!this.isPressed) return;

    const { locationX, locationY, pageX, pageY } = event.nativeEvent;
    
    this.lastTouchPosition = { ...this.currentTouchPosition };
    this.currentTouchPosition = { x: locationX || pageX, y: locationY || pageY };

    const eventData = {
      position: this.currentTouchPosition,
      lastPosition: this.lastTouchPosition,
      delta: {
        x: this.currentTouchPosition.x - this.lastTouchPosition.x,
        y: this.currentTouchPosition.y - this.lastTouchPosition.y
      },
      timestamp: Date.now(),
      isPressed: this.isPressed
    };

    this.trigger('move', eventData);
  }

  /**
   * Handle touch end event
   * @param {Object} event - Touch event
   */
  handleTouchEnd(event) {
    const touchDuration = Date.now() - this.touchStartTime;
    const { locationX, locationY, pageX, pageY } = event.nativeEvent;
    
    const endPosition = { x: locationX || pageX, y: locationY || pageY };
    
    const eventData = {
      position: endPosition,
      startPosition: this.lastTouchPosition,
      duration: touchDuration,
      timestamp: Date.now(),
      isPressed: false
    };

    // Determine if it's a tap or long press
    if (touchDuration < 200) { // Quick tap
      this.trigger('tap', eventData);
      console.log('Tap detected:', eventData);
    } else if (touchDuration > 1000) { // Long press
      this.trigger('longpress', eventData);
      console.log('Long press detected:', eventData);
    }

    this.trigger('release', eventData);
    console.log('Touch ended:', eventData);
    
    this.isPressed = false;
  }

  /**
   * Get current touch state
   */
  getTouchState() {
    return {
      isPressed: this.isPressed,
      currentPosition: this.currentTouchPosition,
      lastPosition: this.lastTouchPosition,
      touchDuration: this.isPressed ? Date.now() - this.touchStartTime : 0
    };
  }

  /**
   * Convert screen coordinates to normalized device coordinates (-1 to 1)
   * @param {number} x - Screen X coordinate
   * @param {number} y - Screen Y coordinate
   * @param {number} screenWidth - Screen width
   * @param {number} screenHeight - Screen height
   */
  screenToNDC(x, y, screenWidth, screenHeight) {
    return {
      x: (x / screenWidth) * 2 - 1,
      y: -(y / screenHeight) * 2 + 1
    };
  }

  /**
   * Create gesture handlers for React Native components
   */
  createTouchHandlers() {
    return {
      onTouchStart: (event) => this.handleTouchStart(event),
      onTouchMove: (event) => this.handleTouchMove(event),
      onTouchEnd: (event) => this.handleTouchEnd(event),
      onTouchCancel: (event) => this.handleTouchEnd(event)
    };
  }

  /**
   * Cleanup all handlers
   */
  cleanup() {
    this.touchHandlers.clear();
    this.gestureHandlers.clear();
    console.log('InputManager cleaned up');
  }
}

// Export a singleton instance
export const inputManager = new InputManager();