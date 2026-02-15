import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';

export function Profile() {
  const { isLoading, isPending } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  const { isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Spinner size="md" />}
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
