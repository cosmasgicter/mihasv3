import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Admin() {
  const { data, isPending } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  const { data, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  
  
  
  if (isEmpty) {
    return <div>No data available</div>;
  }
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
