import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  const { data, isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  
  <Button loading={isLoading}>Submit</Button>
  
  if (isEmpty) {
    return <div>No data available</div>;
  }
  if (isEmpty) {
    return <div>No data available</div>;
  }
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
