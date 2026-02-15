import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';

export function Profile() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  {isLoading && <Spinner size="md" />}
  
  {data?.length === 0 && <EmptyState message="No items" />}
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
