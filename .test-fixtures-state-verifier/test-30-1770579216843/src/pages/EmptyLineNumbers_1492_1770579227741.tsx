import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  const { isPending, error } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  const { data, error } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  if (isEmpty) {
    return <div>No data available</div>;
  }
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
