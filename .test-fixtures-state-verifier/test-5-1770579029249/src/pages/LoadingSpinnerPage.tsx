
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export function LoadingSpinnerPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/admin?action=dashboard').then(res => res.json())
  });
  
  if (isLoading) {
    return <LoadingSpinner />;
  }
  
  return <div>{JSON.stringify(data)}</div>;
}
