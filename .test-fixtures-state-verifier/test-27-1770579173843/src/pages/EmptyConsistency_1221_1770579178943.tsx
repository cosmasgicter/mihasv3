import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  const { isLoading, isPending } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  const { data } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
