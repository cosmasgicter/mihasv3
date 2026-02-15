import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';

export function Applications() {
  const { data } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  const { data, isLoading, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Spinner size="md" />}
  
  
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
