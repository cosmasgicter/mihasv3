
import React from 'react';
import { useNotifications } from '@/hooks/useNotifications';

export function CustomHookPage() {
  const { data, isLoading } = useNotifications();
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  return <div>{JSON.stringify(data)}</div>;
}
