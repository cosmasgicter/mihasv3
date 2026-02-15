import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';

export function Settings() {
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  
  
  
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
