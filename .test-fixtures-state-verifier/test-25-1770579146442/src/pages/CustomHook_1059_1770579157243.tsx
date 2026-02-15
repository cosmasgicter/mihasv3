
import React from 'react';
import { useUsers } from '@/hooks/useUsers';

export function CustomHookPage() {
  const { data, isLoading } = useUsers();
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  return <div>{JSON.stringify(data)}</div>;
}
