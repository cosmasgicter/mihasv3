import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';

export function Profile() {
  const { isLoading, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  {isLoading && <Spinner size="md" />}
  
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
