import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';

export function Profile() {
  const { data, isLoading, isPending } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  {data?.length === 0 && <EmptyState message="No items" />}
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
