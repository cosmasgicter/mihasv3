import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
