import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';

export function Profile() {
  const { data } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  const { data, isPending, error } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  
  <Suspense fallback={<div>Loading...</div>}>
  <Suspense fallback={<div>Loading...</div>}>
  
  {data?.length === 0 && <EmptyState message="No items" />}
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Profile</h1></div>
    </Suspense>
  );
}

export default Profile;
