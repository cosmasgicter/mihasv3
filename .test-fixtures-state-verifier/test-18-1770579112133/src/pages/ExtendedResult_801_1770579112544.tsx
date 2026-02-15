import React, { Suspense } from 'react';

export function Profile() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
