import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';

export function Settings() {
  const { data, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  const { data } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  
  
  
  {data?.length === 0 && <EmptyState message="No items" />}
  if (isEmpty) {
    return <div>No data available</div>;
  }
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
