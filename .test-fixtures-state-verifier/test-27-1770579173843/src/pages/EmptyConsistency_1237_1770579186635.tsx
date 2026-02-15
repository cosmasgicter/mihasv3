import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';

export function Profile() {
  const { isLoading, isPending, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  {isLoading && <Spinner size="md" />}
  
  
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
