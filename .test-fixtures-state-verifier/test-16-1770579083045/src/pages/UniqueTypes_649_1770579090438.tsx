import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';

export function Applications() {
  const { data, isPending, error } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  
  {isLoading && <Spinner size="md" />}
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
