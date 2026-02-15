import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { data } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  
  <Suspense fallback={<div>Loading...</div>}>
  
  
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Applications</h1></div>
    </Suspense>
  );
}

export default Applications;
