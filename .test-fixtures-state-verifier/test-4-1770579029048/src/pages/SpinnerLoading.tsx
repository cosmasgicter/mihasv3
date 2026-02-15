
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';

export function SpinnerPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  if (isLoading) {
    return <Spinner size="lg" />;
  }
  
  return <div>{JSON.stringify(data)}</div>;
}
