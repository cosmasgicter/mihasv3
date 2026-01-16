/**
 * RealtimeProvider Component - Supabase Realtime subscription wrapper
 * Provides real-time data updates for dashboard components
 * 
 * @requirements 8.3 - Supabase UI realtime components for dashboard updates
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface RealtimeSubscription {
  table: string;
  schema?: string;
  event?: RealtimeEvent;
  filter?: string;
}

interface RealtimeContextValue {
  subscribe: (
    subscription: RealtimeSubscription,
    callback: (payload: RealtimePostgresChangesPayload<any>) => void
  ) => () => void;
  isConnected: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

interface RealtimeProviderProps {
  children: React.ReactNode;
}

export function RealtimeProvider({ children }: RealtimeProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map());
  const subscriptionsRef = useRef<Map<string, Set<(payload: any) => void>>>(new Map());

  // Generate a unique key for a subscription
  const getSubscriptionKey = (sub: RealtimeSubscription): string => {
    return `${sub.schema || 'public'}:${sub.table}:${sub.event || '*'}:${sub.filter || ''}`;
  };

  // Subscribe to realtime changes
  const subscribe = useCallback((
    subscription: RealtimeSubscription,
    callback: (payload: RealtimePostgresChangesPayload<any>) => void
  ) => {
    const key = getSubscriptionKey(subscription);
    
    // Add callback to subscriptions
    if (!subscriptionsRef.current.has(key)) {
      subscriptionsRef.current.set(key, new Set());
    }
    subscriptionsRef.current.get(key)!.add(callback);

    // Create channel if it doesn't exist
    if (!channelsRef.current.has(key)) {
      const channelConfig: {
        event: RealtimeEvent;
        schema: string;
        table: string;
        filter?: string;
      } = {
        event: subscription.event || '*',
        schema: subscription.schema || 'public',
        table: subscription.table,
      };
      
      if (subscription.filter) {
        channelConfig.filter = subscription.filter;
      }

      const channel = supabase
        .channel(`realtime:${key}`)
        .on(
          'postgres_changes' as any,
          channelConfig,
          (payload: any) => {
            // Notify all subscribers
            const callbacks = subscriptionsRef.current.get(key);
            if (callbacks) {
              callbacks.forEach((cb) => cb(payload));
            }
          }
        )
        .subscribe((status) => {
          setIsConnected(status === 'SUBSCRIBED');
        });

      channelsRef.current.set(key, channel);
    }

    // Return unsubscribe function
    return () => {
      const callbacks = subscriptionsRef.current.get(key);
      if (callbacks) {
        callbacks.delete(callback);
        
        // If no more callbacks, unsubscribe from channel
        if (callbacks.size === 0) {
          const channel = channelsRef.current.get(key);
          if (channel) {
            supabase.removeChannel(channel);
            channelsRef.current.delete(key);
          }
          subscriptionsRef.current.delete(key);
        }
      }
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      channelsRef.current.forEach((channel) => {
        supabase.removeChannel(channel);
      });
      channelsRef.current.clear();
      subscriptionsRef.current.clear();
    };
  }, []);

  return (
    <RealtimeContext.Provider value={{ subscribe, isConnected }}>
      {children}
    </RealtimeContext.Provider>
  );
}

// Hook to use realtime context
export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
}

// Hook to subscribe to table changes
export function useRealtimeSubscription<T = any>(
  table: string,
  options: {
    schema?: string;
    event?: RealtimeEvent;
    filter?: string;
    onInsert?: (record: T) => void;
    onUpdate?: (record: T, oldRecord: T) => void;
    onDelete?: (oldRecord: T) => void;
    onChange?: (payload: RealtimePostgresChangesPayload<T>) => void;
  } = {}
) {
  const { subscribe, isConnected } = useRealtime();

  useEffect(() => {
    const unsubscribe = subscribe(
      {
        table,
        schema: options.schema,
        event: options.event,
        filter: options.filter,
      },
      (payload) => {
        // Call specific handlers
        if (payload.eventType === 'INSERT' && options.onInsert) {
          options.onInsert(payload.new as T);
        } else if (payload.eventType === 'UPDATE' && options.onUpdate) {
          options.onUpdate(payload.new as T, payload.old as T);
        } else if (payload.eventType === 'DELETE' && options.onDelete) {
          options.onDelete(payload.old as T);
        }

        // Call generic handler
        if (options.onChange) {
          options.onChange(payload as RealtimePostgresChangesPayload<T>);
        }
      }
    );

    return unsubscribe;
  }, [table, options.schema, options.event, options.filter, subscribe]);

  return { isConnected };
}

export default RealtimeProvider;
