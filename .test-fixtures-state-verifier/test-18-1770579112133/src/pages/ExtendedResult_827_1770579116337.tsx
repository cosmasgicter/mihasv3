import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { data, isPending } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  const { isLoading, isPending, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  
  
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
