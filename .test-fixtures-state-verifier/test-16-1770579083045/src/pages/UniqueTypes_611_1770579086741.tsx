import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Admin() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  
  <Suspense fallback={<div>Loading...</div>}>
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Admin</h1></div>
    </Suspense>
  );
}

export default Admin;
