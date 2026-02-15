import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  const { isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
