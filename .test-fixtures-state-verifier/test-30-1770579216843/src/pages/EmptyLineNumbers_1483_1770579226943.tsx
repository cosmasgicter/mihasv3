import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';

export function Applications() {
  const { data, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  
  if (loading) {
    return <div>Loading...</div>;
  }
  {isLoading && <Spinner size="md" />}
  
  {data?.length === 0 && <EmptyState message="No items" />}
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
