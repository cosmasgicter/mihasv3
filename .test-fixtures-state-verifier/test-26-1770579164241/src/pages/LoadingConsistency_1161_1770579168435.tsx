import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { data, isLoading, isPending, error } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  
  
  
  if (isEmpty) {
    return <div>No data available</div>;
  }
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
