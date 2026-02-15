import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  const { isLoading, isPending, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
