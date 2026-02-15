import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';

export function Dashboard() {
  const { isPending, error } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  const { isLoading, error } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  
  {isLoading && <Spinner size="md" />}
  <Button loading={isLoading}>Submit</Button>
  
  
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
