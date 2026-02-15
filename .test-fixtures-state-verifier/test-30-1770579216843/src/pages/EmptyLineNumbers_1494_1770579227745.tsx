import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';
import { Loader } from '@/components/ui/Loader';

export function Profile() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  const { isLoading, error } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Spinner size="md" />}
  {isLoading && <Loader />}
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
