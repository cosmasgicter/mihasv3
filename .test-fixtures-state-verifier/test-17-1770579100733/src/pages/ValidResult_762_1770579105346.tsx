import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';

export function Dashboard() {
  const { data, isLoading, isPending } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  const { data, isLoading, error } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  
  {isLoading && <Spinner size="md" />}
  
  
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
