import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';

export function Applications() {
  
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  {isLoading && <Spinner size="md" />}
  
  
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
