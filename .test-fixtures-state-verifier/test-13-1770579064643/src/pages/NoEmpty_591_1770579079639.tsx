
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function NoEmptyHandling() {
  const { data, isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  return <div>{data.map(item => <span key={item.id}>{item.name}</span>)}</div>;
}
