
import React from 'react';
import { useDashboard } from '@/hooks/useDashboard';

export function CustomHookPage() {
  const { data, isLoading } = useDashboard();
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  return <div>{JSON.stringify(data)}</div>;
}
