import React, { Suspense } from 'react';

export function Admin() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
