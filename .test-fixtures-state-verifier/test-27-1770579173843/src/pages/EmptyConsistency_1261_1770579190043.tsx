import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';

export function Profile() {
  const { data, isPending } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  {isLoading && <Skeleton className="h-10 w-full" />}
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
