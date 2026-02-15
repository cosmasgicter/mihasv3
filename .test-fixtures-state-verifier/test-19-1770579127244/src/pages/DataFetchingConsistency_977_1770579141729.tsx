import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  const { data, error } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  const { error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  
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
