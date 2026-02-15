import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Profile() {
  const { isLoading, isPending, error } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  const { isPending } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  {!data?.length && <p>"No results found"</p>}
  if (isEmpty) {
    return <div>No data available</div>;
  }
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
