import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';

export function Profile() {
  const { data, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  const { isPending, error } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
