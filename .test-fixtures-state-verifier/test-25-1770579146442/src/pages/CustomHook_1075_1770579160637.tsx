
import React from 'react';
import { useProfile } from '@/hooks/useProfile';

export function CustomHookPage() {
  const { data, isLoading } = useProfile();
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  return <div>{JSON.stringify(data)}</div>;
}
