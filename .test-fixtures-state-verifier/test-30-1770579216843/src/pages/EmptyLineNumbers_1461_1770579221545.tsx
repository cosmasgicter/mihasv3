import React, { Suspense } from 'react';

export function Admin() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  {!data?.length && <p>"No results found"</p>}
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
