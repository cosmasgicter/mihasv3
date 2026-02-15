import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  
  
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
