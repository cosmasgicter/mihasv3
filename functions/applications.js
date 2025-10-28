import { supabaseAdminClient, getUserFromRequest } from './_lib/supabaseClient.js';

const APPLICATION_STATUSES = ['draft', 'submitted', 'under_review', 'approved', 'rejected'];

const SORT_COLUMN_MAP = {
  date: 'created_at',
  name: 'full_name',
  status: 'status',
  program: 'program',
  paymentStatus: 'payment_status',
  created_at: 'created_at',
  full_name: 'full_name'
};

function sanitizeSearchTerm(value = '') {
  return value.trim().replace(/[%_]/g, match => `\\${match}`).replace(/,/g, '\\,');
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
}

function determineSortColumn(sortBy) {
  if (typeof sortBy === 'string' && SORT_COLUMN_MAP[sortBy]) {
    return SORT_COLUMN_MAP[sortBy];
  }
  if (typeof sortBy === 'string' && /^[a-z0-9_]+$/i.test(sortBy)) {
    return sortBy;
  }
  return 'created_at';
}

function applyFilters(queryBuilder, filters = {}, { includeStatus = true } = {}) {
  let nextQuery = queryBuilder;
  
  if (filters.mine && filters.userId) {
    nextQuery = nextQuery.eq('user_id', filters.userId);
  }
  if (includeStatus && filters.status) {
    nextQuery = nextQuery.eq('status', filters.status);
  }
  if (filters.program) {
    nextQuery = nextQuery.eq('program', filters.program);
  }
  if (filters.institution) {
    nextQuery = nextQuery.eq('institution', filters.institution);
  }
  if (filters.paymentStatus) {
    nextQuery = nextQuery.eq('payment_status', filters.paymentStatus);
  }
  if (filters.startDate) {
    nextQuery = nextQuery.gte('created_at', filters.startDate);
  }
  if (filters.endDate) {
    nextQuery = nextQuery.lte('created_at', filters.endDate);
  }
  if (filters.search) {
    const sanitized = sanitizeSearchTerm(filters.search);
    if (sanitized) {
      const pattern = `%${sanitized}%`;
      nextQuery = nextQuery.or(
        ['full_name', 'email', 'application_number'].map(field => `${field}.ilike.${pattern}`).join(',')
      );
    }
  }
  
  return nextQuery;
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  if (request.method === 'GET') {
    try {
      const authContext = await getUserFromRequest(request);
      if (authContext.error) {
        return new Response(JSON.stringify({ error: authContext.error }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check if requesting specific application by ID
      const pathParts = url.pathname.split('/').filter(Boolean);
      if (pathParts.length > 1 && pathParts[pathParts.length - 1].match(/^[0-9a-f-]{36}$/i)) {
        const applicationId = pathParts[pathParts.length - 1];
        
        const { data: app, error } = await supabaseAdminClient
          .from('applications')
          .select('*')
          .eq('id', applicationId)
          .single();

        if (error || !app) {
          return new Response(JSON.stringify({ error: 'Application not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Verify access
        if (!authContext.isAdmin && app.user_id !== authContext.user?.id) {
          return new Response(JSON.stringify({ error: 'Access denied' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify(app), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      const page = parseInt(url.searchParams.get('page') || '0');
      const pageSize = parseInt(url.searchParams.get('pageSize') || '10');
      const status = url.searchParams.get('status');
      const mine = url.searchParams.get('mine');
      const search = url.searchParams.get('search');
      const program = url.searchParams.get('program');
      const institution = url.searchParams.get('institution');
      const paymentStatus = url.searchParams.get('paymentStatus');
      const startDate = url.searchParams.get('startDate');
      const endDate = url.searchParams.get('endDate');
      const sortBy = url.searchParams.get('sortBy');
      const sortOrder = url.searchParams.get('sortOrder');
      const includeStats = url.searchParams.get('includeStats');
      
      const from = page * pageSize;
      const to = from + pageSize - 1;
      
      const userId = authContext.user?.id;
      const isAdmin = Boolean(authContext.isAdmin);
      const mineRequested = parseBoolean(mine);
      const shouldFilterByUser = Boolean(userId) && (!isAdmin || mineRequested);
      
      const filterOptions = {
        userId,
        mine: shouldFilterByUser,
        status,
        search,
        program,
        institution,
        paymentStatus,
        startDate,
        endDate
      };
      
      const sortColumn = determineSortColumn(sortBy);
      const sortAscending = sortOrder?.toLowerCase() === 'asc';
      
      let query = applyFilters(
        supabaseAdminClient.from('applications').select('*', { count: 'exact' }),
        filterOptions
      );
      
      query = query.order(sortColumn, { ascending: sortAscending }).range(from, to);
      
      const { data, error, count } = await query;
      
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      let stats;
      if (parseBoolean(includeStats)) {
        const baseCountQuery = applyFilters(
          supabaseAdminClient.from('applications').select('id', { count: 'exact', head: true }),
          filterOptions,
          { includeStatus: false }
        );
        
        const { count: baseCount } = await baseCountQuery;
        const statusBreakdown = {};
        
        for (const statusValue of APPLICATION_STATUSES) {
          const statusQuery = applyFilters(
            supabaseAdminClient.from('applications').select('id', { count: 'exact', head: true }).eq('status', statusValue),
            filterOptions,
            { includeStatus: false }
          );
          const { count: statusCount } = await statusQuery;
          statusBreakdown[statusValue] = statusCount || 0;
        }
        
        stats = { total: baseCount || 0, statusBreakdown };
      }
      
      return new Response(JSON.stringify({
        applications: data || [],
        totalCount: count || 0,
        page,
        pageSize,
        ...(stats ? { stats } : {})
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
  
  if (request.method === 'POST') {
    try {
      const authContext = await getUserFromRequest(request);
      if (authContext.error || !authContext.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const body = await request.json();
      const { data, error } = await supabaseAdminClient
        .from('applications')
        .insert({ ...body, user_id: authContext.user.id })
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify(data), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  if (request.method === 'PATCH' || request.method === 'PUT') {
    try {
      const authContext = await getUserFromRequest(request);
      if (authContext.error || !authContext.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const url = new URL(request.url);
      const pathParts = url.pathname.split('/').filter(Boolean);
      const applicationId = pathParts[pathParts.length - 1];

      if (!applicationId) {
        return new Response(JSON.stringify({ error: 'Application ID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const body = await request.json();
      
      // Remove action field if present (used for routing, not a DB column)
      const { action, ...updateData } = body;
      
      // Verify ownership or admin
      const { data: app } = await supabaseAdminClient
        .from('applications')
        .select('user_id')
        .eq('id', applicationId)
        .single();

      if (!app) {
        return new Response(JSON.stringify({ error: 'Application not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const canUpdate = authContext.isAdmin || app.user_id === authContext.user.id;
      if (!canUpdate) {
        return new Response(JSON.stringify({ error: 'Access denied' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data, error } = await supabaseAdminClient
        .from('applications')
        .update(updateData)
        .eq('id', applicationId)
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  if (request.method === 'DELETE') {
    try {
      const authContext = await getUserFromRequest(request);
      if (authContext.error || !authContext.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const url = new URL(request.url);
      const pathParts = url.pathname.split('/').filter(Boolean);
      const applicationId = pathParts[pathParts.length - 1];

      if (!applicationId) {
        return new Response(JSON.stringify({ error: 'Application ID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Verify ownership
      const { data: app, error: fetchError } = await supabaseAdminClient
        .from('applications')
        .select('user_id, status')
        .eq('id', applicationId)
        .single();

      if (fetchError || !app) {
        console.error('DELETE: Application not found', { applicationId, error: fetchError?.message });
        return new Response(JSON.stringify({ error: 'Application not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Allow deletion if user owns it OR if it's a draft (drafts can be deleted by creator)
      const canDelete = app.user_id === authContext.user.id || app.status === 'draft';
      if (!canDelete) {
        console.error('DELETE: Access denied', { applicationId, userId: authContext.user.id, ownerId: app.user_id, status: app.status });
        return new Response(JSON.stringify({ error: 'Access denied' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { error } = await supabaseAdminClient
        .from('applications')
        .delete()
        .eq('id', applicationId);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
  
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
