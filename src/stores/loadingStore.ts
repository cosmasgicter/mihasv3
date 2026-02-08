/**
 * Loading Store
 * 
 * Zustand store for managing global loading states.
 * Tracks multiple concurrent loading operations via unique keys.
 * 
 * REQUIREMENTS:
 * - 3.3: Provide a single global loading mechanism
 * 
 * USAGE:
 * ```typescript
 * const { startLoading, stopLoading, isKeyLoading, isLoading } = useLoadingStore();
 * 
 * // Start a loading operation
 * startLoading('fetch-applications');
 * 
 * // Check if any loading is happening
 * if (isLoading) { ... }
 * 
 * // Check specific loading key
 * if (isKeyLoading('fetch-applications')) { ... }
 * 
 * // Stop loading when done
 * stopLoading('fetch-applications');
 * ```
 */

import { create } from 'zustand';

/**
 * Loading state interface
 */
interface LoadingState {
  /**
   * Whether any loading operation is in progress
   * True when loadingKeys has at least one entry
   */
  isLoading: boolean;
  
  /**
   * Set of unique keys representing active loading operations
   * Using Set for O(1) add/remove/check operations
   */
  loadingKeys: Set<string>;
  
  /**
   * Start tracking a loading operation
   * @param key - Unique identifier for the loading operation
   */
  startLoading: (key: string) => void;
  
  /**
   * Stop tracking a loading operation
   * @param key - Unique identifier for the loading operation
   */
  stopLoading: (key: string) => void;
  
  /**
   * Check if a specific loading operation is in progress
   * @param key - Unique identifier for the loading operation
   * @returns true if the key is currently loading
   */
  isKeyLoading: (key: string) => boolean;
  
  /**
   * Clear all loading states
   * Useful for cleanup on unmount or error recovery
   */
  clearAll: () => void;
  
  /**
   * Get all currently active loading keys
   * Useful for debugging
   */
  getActiveKeys: () => string[];
}

/**
 * Global loading store
 * 
 * Manages multiple concurrent loading states via unique keys.
 * The `isLoading` boolean is automatically computed based on
 * whether any keys are currently in the loadingKeys set.
 */
export const useLoadingStore = create<LoadingState>()((set, get) => ({
  // Initial state
  isLoading: false,
  loadingKeys: new Set<string>(),

  /**
   * Start tracking a loading operation
   * 
   * Adds the key to loadingKeys and sets isLoading to true.
   * Idempotent - calling with the same key multiple times is safe.
   */
  startLoading: (key: string) => {
    set((state) => {
      // Create a new Set to ensure React detects the change
      const newKeys = new Set(state.loadingKeys);
      newKeys.add(key);
      
      return {
        loadingKeys: newKeys,
        isLoading: true,
      };
    });
  },

  /**
   * Stop tracking a loading operation
   * 
   * Removes the key from loadingKeys and updates isLoading
   * based on whether any keys remain.
   * Idempotent - calling with a non-existent key is safe.
   */
  stopLoading: (key: string) => {
    set((state) => {
      // Create a new Set to ensure React detects the change
      const newKeys = new Set(state.loadingKeys);
      newKeys.delete(key);
      
      return {
        loadingKeys: newKeys,
        isLoading: newKeys.size > 0,
      };
    });
  },

  /**
   * Check if a specific loading operation is in progress
   * 
   * This is a method rather than a selector to allow checking
   * any key without needing to subscribe to the entire loadingKeys set.
   */
  isKeyLoading: (key: string) => {
    return get().loadingKeys.has(key);
  },

  /**
   * Clear all loading states
   * 
   * Resets the store to initial state.
   * Useful for cleanup on error recovery or navigation.
   */
  clearAll: () => {
    set({
      loadingKeys: new Set<string>(),
      isLoading: false,
    });
  },

  /**
   * Get all currently active loading keys
   * 
   * Returns an array of all keys currently being tracked.
   * Useful for debugging and monitoring.
   */
  getActiveKeys: () => {
    return Array.from(get().loadingKeys);
  },
}));

/**
 * Helper hook to get just the global loading state
 */
export const useIsLoading = () => useLoadingStore((state) => state.isLoading);

/**
 * Helper hook to get loading state for a specific key
 * 
 * Note: This creates a subscription that updates when loadingKeys changes.
 * For one-off checks, use the store's isKeyLoading method directly.
 */
export const useKeyLoading = (key: string) => 
  useLoadingStore((state) => state.loadingKeys.has(key));

/**
 * Helper hook to get loading actions
 * 
 * Returns only the action functions, useful when you don't need
 * to subscribe to state changes.
 */
export const useLoadingActions = () => 
  useLoadingStore((state) => ({
    startLoading: state.startLoading,
    stopLoading: state.stopLoading,
    clearAll: state.clearAll,
  }));

/**
 * Helper hook for managing a single loading operation
 * 
 * Returns a tuple of [isLoading, startLoading, stopLoading] for a specific key.
 * Useful for components that manage a single loading operation.
 * 
 * @param key - Unique identifier for the loading operation
 * @returns [isLoading, startLoading, stopLoading]
 * 
 * @example
 * ```typescript
 * const [isLoading, startLoading, stopLoading] = useLoadingKey('fetch-data');
 * 
 * const fetchData = async () => {
 *   startLoading();
 *   try {
 *     await api.fetchData();
 *   } finally {
 *     stopLoading();
 *   }
 * };
 * ```
 */
export const useLoadingKey = (key: string): [boolean, () => void, () => void] => {
  const isLoading = useLoadingStore((state) => state.loadingKeys.has(key));
  const { startLoading, stopLoading } = useLoadingStore.getState();
  
  return [
    isLoading,
    () => startLoading(key),
    () => stopLoading(key),
  ];
};
