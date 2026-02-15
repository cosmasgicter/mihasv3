import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
