import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { data, isPending, error } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
