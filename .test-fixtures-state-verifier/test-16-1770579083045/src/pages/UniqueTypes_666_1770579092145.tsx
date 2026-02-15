import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  const { isPending, error } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/sessions').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  {!data?.length && <p>"No results found"</p>}
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
