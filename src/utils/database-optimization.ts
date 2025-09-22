// Database performance optimization utilities for serverless architecture

// SQL query optimization helpers
export class QueryOptimizer {
  // Generate optimized indexes for common queries
  static generatePerformanceIndexes(): string[] {
    return [
      // Applications table indexes
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_status_created 
       ON applications (status, created_at DESC) 
       WHERE status != 'draft';`,
      
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_program_status 
       ON applications (program, status, created_at DESC);`,
      
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_tracking_code 
       ON applications (tracking_code) 
       WHERE tracking_code IS NOT NULL;`,
      
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_user_id 
       ON applications (user_id, status);`,
      
      // Payment related indexes
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_payment_status 
       ON applications (payment_status, updated_at DESC) 
       WHERE payment_status != 'pending';`,
      
      // Search optimization
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_search 
       ON applications USING gin(to_tsvector('english', full_name || ' ' || email));`,
      
      // Grades table indexes
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_application_grades_app_id 
       ON application_grades (application_id, subject);`,
      
      // Email notifications indexes
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_notifications_status 
       ON email_notifications (status, created_at DESC);`,
      
      // Audit log indexes
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_timestamp 
       ON audit_log (timestamp DESC, table_name);`,
      
      // User sessions indexes
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_sessions_user_id 
       ON user_sessions (user_id, expires_at) 
       WHERE expires_at > NOW();`
    ]
  }

  // Optimized query builders for common operations
  static buildDashboardQuery(filters: {
    dateRange?: string
    status?: string
    program?: string
    institution?: string
  }): { sql: string; params: any[] } {
    const params: any[] = []
    let whereConditions: string[] = []
    let paramIndex = 1

    // Date filter
    if (filters.dateRange) {
      const daysAgo = {
        'today': 1,
        'week': 7,
        'month': 30,
        'quarter': 90
      }[filters.dateRange] || 30
      
      whereConditions.push(`created_at >= NOW() - INTERVAL '${daysAgo} days'`)
    }

    // Status filter
    if (filters.status) {
      whereConditions.push(`status = $${paramIndex++}`)
      params.push(filters.status)
    }

    // Program filter
    if (filters.program) {
      whereConditions.push(`program = $${paramIndex++}`)
      params.push(filters.program)
    }

    // Institution filter
    if (filters.institution) {
      whereConditions.push(`institution = $${paramIndex++}`)
      params.push(filters.institution)
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : ''

    const sql = `
      SELECT 
        COUNT(*) as total_applications,
        COUNT(*) FILTER (WHERE status = 'submitted') as submitted_count,
        COUNT(*) FILTER (WHERE status = 'under-review') as under_review_count,
        COUNT(*) FILTER (WHERE status = 'approved') as approved_count,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count,
        COUNT(*) FILTER (WHERE payment_status = 'pending') as pending_payment_count,
        COUNT(*) FILTER (WHERE payment_status = 'verified') as verified_payment_count,
        AVG(eligibility_score) as avg_eligibility_score,
        COUNT(DISTINCT program) as unique_programs
      FROM applications
      ${whereClause}
      AND created_at >= NOW() - INTERVAL '1 year'
    `

    return { sql, params }
  }

  static buildApplicationListQuery({
    search,
    status,
    paymentStatus,
    program,
    dateRange,
    sortField = 'created_at',
    sortDirection = 'DESC',
    limit = 50,
    offset = 0
  }: {
    search?: string
    status?: string
    paymentStatus?: string
    program?: string
    dateRange?: string
    sortField?: string
    sortDirection?: 'ASC' | 'DESC'
    limit?: number
    offset?: number
  }): { sql: string; params: any[] } {
    const params: any[] = []
    let whereConditions: string[] = []
    let paramIndex = 1

    // Search filter using full-text search
    if (search) {
      whereConditions.push(`(
        to_tsvector('english', full_name || ' ' || email || ' ' || COALESCE(tracking_code, '')) 
        @@ plainto_tsquery('english', $${paramIndex++})
        OR full_name ILIKE $${paramIndex++}
        OR email ILIKE $${paramIndex++}
        OR tracking_code ILIKE $${paramIndex++}
      )`)
      params.push(search, `%${search}%`, `%${search}%`, `%${search}%`)
    }

    // Status filter
    if (status) {
      whereConditions.push(`status = $${paramIndex++}`)
      params.push(status)
    }

    // Payment status filter
    if (paymentStatus) {
      whereConditions.push(`payment_status = $${paramIndex++}`)
      params.push(paymentStatus)
    }

    // Program filter
    if (program) {
      whereConditions.push(`program = $${paramIndex++}`)
      params.push(program)
    }

    // Date range filter
    if (dateRange) {
      const daysAgo = {
        'today': 1,
        'week': 7,
        'month': 30,
        'quarter': 90
      }[dateRange]
      
      if (daysAgo) {
        whereConditions.push(`created_at >= NOW() - INTERVAL '${daysAgo} days'`)
      }
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : ''

    // Validate sort field for security
    const allowedSortFields = ['created_at', 'updated_at', 'full_name', 'status', 'program', 'eligibility_score']
    const safeSortField = allowedSortFields.includes(sortField) ? sortField : 'created_at'
    const safeSortDirection = ['ASC', 'DESC'].includes(sortDirection) ? sortDirection : 'DESC'

    params.push(limit, offset)

    const sql = `
      SELECT 
        id,
        full_name,
        email,
        phone,
        program,
        status,
        payment_status,
        tracking_code,
        institution,
        eligibility_score,
        created_at,
        updated_at
      FROM applications
      ${whereClause}
      ORDER BY ${safeSortField} ${safeSortDirection}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `

    return { sql, params }
  }
}

// Connection pooling utility for serverless functions
export class ConnectionPool {
  private static instance: ConnectionPool
  private pool: any = null
  private config: any = {}

  private constructor() {}

  static getInstance(): ConnectionPool {
    if (!ConnectionPool.instance) {
      ConnectionPool.instance = new ConnectionPool()
    }
    return ConnectionPool.instance
  }

  configure(config: {
    connectionString: string
    max?: number
    idleTimeoutMillis?: number
    connectionTimeoutMillis?: number
  }) {
    this.config = {
      max: 5, // Reduced for serverless
      idleTimeoutMillis: 30000, // 30 seconds
      connectionTimeoutMillis: 5000, // 5 seconds
      ...config
    }
  }

  async getConnection() {
    if (!this.pool) {
      // Dynamic import to avoid bundling issues
      const { Pool } = await import('pg')
      
      this.pool = new Pool({
        connectionString: this.config.connectionString,
        max: this.config.max,
        idleTimeoutMillis: this.config.idleTimeoutMillis,
        connectionTimeoutMillis: this.config.connectionTimeoutMillis,
        ssl: {
          rejectUnauthorized: false
        }
      })

      // Handle pool errors
      this.pool.on('error', (err: Error) => {
        console.error('Unexpected error on idle client', err)
      })
    }

    return this.pool
  }

  async query(text: string, params?: any[]) {
    const pool = await this.getConnection()
    const start = Date.now()
    
    try {
      const result = await pool.query(text, params)
      const duration = Date.now() - start
      
      // Log slow queries
      if (duration > 1000) {
        console.warn(`Slow query detected (${duration}ms):`, text.substring(0, 100))
      }
      
      return result
    } catch (error) {
      console.error('Database query error:', error)
      throw error
    }
  }

  async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    const pool = await this.getConnection()
    const client = await pool.connect()
    
    try {
      await client.query('BEGIN')
      const result = await callback(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async end() {
    if (this.pool) {
      await this.pool.end()
      this.pool = null
    }
  }
}

// Query performance monitoring
export class QueryMonitor {
  private static slowQueries: Array<{
    query: string
    duration: number
    timestamp: Date
    params?: any[]
  }> = []

  static logQuery(query: string, duration: number, params?: any[]) {
    if (duration > 500) { // Log queries slower than 500ms
      this.slowQueries.push({
        query: query.substring(0, 200), // Truncate for storage
        duration,
        timestamp: new Date(),
        params: params?.length ? ['[REDACTED]'] : undefined // Don't log actual params for security
      })

      // Keep only last 100 slow queries
      if (this.slowQueries.length > 100) {
        this.slowQueries = this.slowQueries.slice(-100)
      }
    }
  }

  static getSlowQueries(limit: number = 10) {
    return this.slowQueries
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit)
  }

  static getPerformanceStats() {
    if (this.slowQueries.length === 0) {
      return {
        totalSlowQueries: 0,
        averageDuration: 0,
        slowestQuery: null,
        recentSlowQueries: 0
      }
    }

    const totalDuration = this.slowQueries.reduce((sum, q) => sum + q.duration, 0)
    const averageDuration = totalDuration / this.slowQueries.length
    const slowestQuery = this.slowQueries.reduce((slowest, current) => 
      current.duration > slowest.duration ? current : slowest
    )
    
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const recentSlowQueries = this.slowQueries.filter(q => q.timestamp > oneHourAgo).length

    return {
      totalSlowQueries: this.slowQueries.length,
      averageDuration: Math.round(averageDuration),
      slowestQuery: {
        query: slowestQuery.query,
        duration: slowestQuery.duration,
        timestamp: slowestQuery.timestamp
      },
      recentSlowQueries
    }
  }
}

// Database health checker for monitoring
export class DatabaseHealthChecker {
  static async checkHealth(): Promise<{
    healthy: boolean
    latency: number
    connections: number
    errors: string[]
  }> {
    const errors: string[] = []
    let healthy = true
    let latency = 0
    let connections = 0

    try {
      const connectionPool = ConnectionPool.getInstance()
      const start = Date.now()
      
      // Test basic connectivity
      const result = await connectionPool.query('SELECT 1 as test, NOW() as server_time')
      latency = Date.now() - start
      
      if (!result.rows || result.rows.length === 0) {
        errors.push('Database query returned no results')
        healthy = false
      }

      // Check connection pool status
      const poolStatus = await connectionPool.query(`
        SELECT 
          count(*) as total_connections,
          count(*) FILTER (WHERE state = 'active') as active_connections,
          count(*) FILTER (WHERE state = 'idle') as idle_connections
        FROM pg_stat_activity 
        WHERE datname = current_database()
      `)
      
      connections = poolStatus.rows[0]?.total_connections || 0
      
      // Check for blocking queries
      const blockingQueries = await connectionPool.query(`
        SELECT count(*) as blocked_count
        FROM pg_stat_activity 
        WHERE wait_event_type = 'Lock' 
        AND state = 'active'
      `)
      
      const blockedCount = blockingQueries.rows[0]?.blocked_count || 0
      if (blockedCount > 5) {
        errors.push(`High number of blocked queries: ${blockedCount}`)
      }

      // Check disk space (if accessible)
      try {
        const diskSpace = await connectionPool.query(`
          SELECT 
            pg_size_pretty(pg_database_size(current_database())) as database_size
        `)
        
        // This is informational, not a health check failure
        console.log('Database size:', diskSpace.rows[0]?.database_size)
      } catch (e) {
        // Ignore if we can't check disk space
      }

    } catch (error) {
      errors.push(`Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      healthy = false
    }

    return {
      healthy,
      latency,
      connections,
      errors
    }
  }
}

// Export singleton instances
export const connectionPool = ConnectionPool.getInstance()
export const queryOptimizer = QueryOptimizer
export const queryMonitor = QueryMonitor
export const dbHealthChecker = DatabaseHealthChecker
