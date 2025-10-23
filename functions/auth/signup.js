import { supabaseAdminClient } from '../_lib/supabaseClient.js';

export async function onRequestPost(context) {
  const { request } = context;
  const body = await request.json();
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  try {
    const { email, password, ...userData } = body;
    
    // Create auth user
    const { data: authData, error: authError } = await supabaseAdminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: userData.full_name,
        phone: userData.phone,
        date_of_birth: userData.date_of_birth,
        sex: userData.sex,
        residence_town: userData.residence_town,
        nationality: userData.nationality,
        next_of_kin_name: userData.next_of_kin_name,
        next_of_kin_phone: userData.next_of_kin_phone
      }
    });
    
    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Create profile
    const profileData = {
      id: authData.user.id,
      email: authData.user.email,
      role: 'student',
      is_active: true
    };
    
    // Add all available fields
    if (userData.full_name) {
      profileData.full_name = userData.full_name;
      const nameParts = userData.full_name.split(' ');
      profileData.first_name = nameParts[0] || '';
      profileData.last_name = nameParts.slice(1).join(' ') || '';
    }
    if (userData.phone) profileData.phone = userData.phone;
    if (userData.date_of_birth) profileData.date_of_birth = userData.date_of_birth;
    if (userData.sex) profileData.sex = userData.sex;
    if (userData.nationality) profileData.nationality = userData.nationality;
    if (userData.residence_town) profileData.residence_town = userData.residence_town;
    if (userData.next_of_kin_name) profileData.next_of_kin_name = userData.next_of_kin_name;
    if (userData.next_of_kin_phone) profileData.next_of_kin_phone = userData.next_of_kin_phone;
    
    const { error: profileError } = await supabaseAdminClient
      .from('profiles')
      .upsert(profileData, { onConflict: 'id' });
    
    if (profileError) {
      console.error('Profile creation error:', profileError);
      // Rollback: delete auth user if profile creation fails
      await supabaseAdminClient.auth.admin.deleteUser(authData.user.id);
      return new Response(JSON.stringify({ 
        error: 'Database error creating new user',
        details: profileError.message,
        code: profileError.code 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ 
      user: authData.user,
      message: 'Account created successfully'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Signup error:', error);
    return new Response(JSON.stringify({ 
      error: 'Database error creating new user',
      details: error.message 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
