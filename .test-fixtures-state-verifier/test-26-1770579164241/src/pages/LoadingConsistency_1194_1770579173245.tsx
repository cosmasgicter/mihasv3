import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';

export function Profile() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  if (loading) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
