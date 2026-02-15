import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { isLoading, isPending, error } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  
  <Button loading={isLoading}>Submit</Button>
  
  if (isEmpty) {
    return <div>No data available</div>;
  }
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
