
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function NoDataMessagePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['items'],
    queryFn: () => fetch('/api/items').then(res => res.json())
  });
  
  if (isLoading) return <div>Loading...</div>;
  
  if (!data?.length) {
    return <p>"No items"</p>;
  }
  
  return <div>{JSON.stringify(data)}</div>;
}
