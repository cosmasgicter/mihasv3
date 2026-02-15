import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Admin() {
  const { isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  
  <Suspense fallback={<div>Loading...</div>}>
  
  
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Admin</h1></div>
    </Suspense>
  );
}

export default Admin;
