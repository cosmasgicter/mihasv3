
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';

export function EmptyComponentPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  
  if (isLoading) return <div>Loading...</div>;
  
  if (data?.length === 0) {
    return <EmptyState message="No notifications" />;
  }
  
  return <div>{data.map(n => <div key={n.id}>{n.message}</div>)}</div>;
}
