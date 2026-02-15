import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Admin() {
  const { data, isPending } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  
  
  
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
