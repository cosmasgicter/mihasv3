import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';

export function Applications() {
  const { data, isPending } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  
  <Button loading={isLoading}>Submit</Button>
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  {data?.length === 0 && <EmptyState message="No items" />}
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
