
import React from 'react';
import { useAuth } from '@/hooks/useAuth';

export function CustomHookPage() {
  const { data, isLoading } = useAuth();
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  return <div>{JSON.stringify(data)}</div>;
}
