import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

export function Profile() {
  const { data, error } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
