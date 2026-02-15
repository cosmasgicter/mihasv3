import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';

export function Profile() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (loading) {
    return <div>Loading...</div>;
  }
  {isLoading && <Skeleton className="h-10 w-full" />}
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
