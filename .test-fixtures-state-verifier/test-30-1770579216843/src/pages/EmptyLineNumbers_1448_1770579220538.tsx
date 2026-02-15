import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';

export function Profile() {
  const { isLoading, error } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { data, isLoading, isPending } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Spinner size="md" />}
  
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
