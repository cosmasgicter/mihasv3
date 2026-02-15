
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function NoLoadingHandling() {
  const { data } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  
  return <div>{JSON.stringify(data)}</div>;
}
