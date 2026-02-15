import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';

export function Settings() {
  const { data, isPending } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  const { data, isLoading, isPending } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  
  
  
  {data?.length === 0 && <EmptyState message="No items" />}
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
