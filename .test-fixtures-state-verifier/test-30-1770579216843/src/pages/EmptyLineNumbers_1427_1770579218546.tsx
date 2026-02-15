import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Admin() {
  const { data, isPending, error } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  const { isLoading, isPending } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  
  <Suspense fallback={<div>Loading...</div>}>
  
  if (!data) {
    return <div>No data</div>;
  }
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Admin</h1></div>
    </Suspense>
  );
}

export default Admin;
