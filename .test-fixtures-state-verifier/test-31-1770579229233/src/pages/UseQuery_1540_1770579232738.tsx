
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryPage() {
  const { data, isLoading, isPending } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  
  return <div>Test</div>;
}
