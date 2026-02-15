import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  <Button loading={isLoading}>Submit</Button>
  
  
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
