import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';

export function Profile() {
  const { isLoading, isPending } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  
  
  
  {!data?.length && <p>"No results found"</p>}
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
