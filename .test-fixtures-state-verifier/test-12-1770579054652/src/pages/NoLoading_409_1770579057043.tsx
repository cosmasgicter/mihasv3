
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function NoLoadingHandling() {
  const { data } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  
  return <div>{JSON.stringify(data)}</div>;
}
