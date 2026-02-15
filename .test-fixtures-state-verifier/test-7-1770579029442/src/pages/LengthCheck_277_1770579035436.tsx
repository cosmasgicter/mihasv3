
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function EmptyCheckPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return <div>{JSON.stringify(data)}</div>;
}
