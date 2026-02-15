import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { isLoading, isPending, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  
  <Button loading={isLoading}>Submit</Button>
  
  
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
