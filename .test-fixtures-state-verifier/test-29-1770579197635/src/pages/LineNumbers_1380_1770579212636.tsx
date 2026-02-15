import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';

export function Profile() {
  const { isLoading, isPending } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  
  {isLoading && <Spinner size="md" />}
  
  
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
