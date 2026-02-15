import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';

export function Settings() {
  const { data, isPending } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  const { isLoading, error } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
