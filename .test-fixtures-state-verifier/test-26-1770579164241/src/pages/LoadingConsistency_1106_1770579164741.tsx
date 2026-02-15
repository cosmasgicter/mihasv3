import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';

export function Profile() {
  const { data, isLoading, isPending } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  
  <Button loading={isLoading}>Submit</Button>
  {isLoading && <Spinner size="md" />}
  
  {data?.length === 0 && <EmptyState message="No items" />}
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
