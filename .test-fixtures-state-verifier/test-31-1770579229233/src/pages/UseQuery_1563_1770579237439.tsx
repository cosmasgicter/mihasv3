
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryPage() {
  const { isPending } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  
  return <div>Test</div>;
}
