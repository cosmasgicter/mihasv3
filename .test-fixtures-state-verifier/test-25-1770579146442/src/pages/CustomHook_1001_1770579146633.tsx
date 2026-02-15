
import React from 'react';
import { useApplications } from '@/hooks/useApplications';

export function CustomHookPage() {
  const { data, isLoading } = useApplications();
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  return <div>{JSON.stringify(data)}</div>;
}
