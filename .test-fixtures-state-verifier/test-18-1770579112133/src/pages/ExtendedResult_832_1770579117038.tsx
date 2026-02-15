import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';

export function Applications() {
  const { isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  
  <Button loading={isLoading}>Submit</Button>
  {isLoading && <Spinner size="md" />}
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
