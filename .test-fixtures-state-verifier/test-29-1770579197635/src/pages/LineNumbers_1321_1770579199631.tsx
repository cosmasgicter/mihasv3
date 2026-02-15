import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { data, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  const { data, isLoading, isPending, error } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
