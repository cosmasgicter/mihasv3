
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryPage() {
  const { data, isPending } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  
  return <div>Test</div>;
}
