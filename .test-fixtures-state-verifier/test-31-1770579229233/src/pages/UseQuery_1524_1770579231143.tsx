
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  
  return <div>Test</div>;
}
