import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';
import { Loader } from '@/components/ui/Loader';

export function Profile() {
  const { data, isPending } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  const { isPending } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  {isLoading && <Loader />}
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
