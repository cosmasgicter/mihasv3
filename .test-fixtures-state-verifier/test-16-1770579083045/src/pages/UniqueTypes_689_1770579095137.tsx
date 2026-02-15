import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { error } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  
  <Button loading={isLoading}>Submit</Button>
  <Suspense fallback={<div>Loading...</div>}>
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Applications</h1></div>
    </Suspense>
  );
}

export default Applications;
