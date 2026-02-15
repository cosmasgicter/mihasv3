import React, { Suspense } from 'react';

export function Admin() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  <Button loading={isLoading}>Submit</Button>
  
  
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
