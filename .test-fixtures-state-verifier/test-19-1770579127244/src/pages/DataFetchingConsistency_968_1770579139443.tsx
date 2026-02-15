import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/Loader';

export function Profile() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Loader />}
  <Button loading={isLoading}>Submit</Button>
  
  
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
