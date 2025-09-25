import { randomUUID } from 'node:crypto'
import {
  mockDatabase,
  mockUsers
} from './mockData.js'

const clone = (value) => JSON.parse(JSON.stringify(value))

class MockQueryBuilder {
  constructor(table) {
    this.table = table
    this._action = 'select'
    this._payload = null
    this._filters = []
    this._orders = []
    this._range = null
    this._single = false
    this._maybeSingle = false
    this._count = null
    this._upsertOptions = {}
  }

  _getTable() {
    if (!mockDatabase[this.table]) {
      mockDatabase[this.table] = []
    }
    return mockDatabase[this.table]
  }

  select(_columns = '*', options = {}) {
    if (options?.count) {
      this._count = options.count
    }
    this._action = this._action || 'select'
    return this
  }

  eq(field, value) {
    this._filters.push((record) => record?.[field] === value)
    return this
  }

  is(field, value) {
    this._filters.push((record) => {
      const current = record?.[field] ?? null
      return value === null ? current === null : current === value
    })
    return this
  }

  order(field, options = {}) {
    const ascending = options?.ascending !== false
    this._orders.push({ field, ascending })
    return this
  }

  range(from, to) {
    this._range = { from, to }
    return this
  }

  single() {
    this._single = true
    return this
  }

  maybeSingle() {
    this._maybeSingle = true
    return this
  }

  insert(payload) {
    this._action = 'insert'
    this._payload = Array.isArray(payload) ? payload : [payload]
    return this
  }

  update(payload) {
    this._action = 'update'
    this._payload = payload
    return this
  }

  upsert(payload, options = {}) {
    this._action = 'upsert'
    this._payload = Array.isArray(payload) ? payload[0] : payload
    this._upsertOptions = options
    return this
  }

  _applyFilters(data) {
    if (!this._filters.length) {
      return data
    }
    return data.filter((record) => this._filters.every((fn) => fn(record)))
  }

  _applyOrder(data) {
    if (!this._orders.length) {
      return data
    }
    const ordered = [...data]
    ordered.sort((a, b) => {
      for (const order of this._orders) {
        const { field, ascending } = order
        const aValue = a?.[field]
        const bValue = b?.[field]

        if (aValue === bValue) {
          continue
        }

        if (aValue === undefined || aValue === null) {
          return ascending ? 1 : -1
        }

        if (bValue === undefined || bValue === null) {
          return ascending ? -1 : 1
        }

        if (aValue > bValue) {
          return ascending ? 1 : -1
        }

        if (aValue < bValue) {
          return ascending ? -1 : 1
        }
      }
      return 0
    })
    return ordered
  }

  _applyRange(data) {
    if (!this._range) {
      return data
    }
    const { from, to } = this._range
    const end = typeof to === 'number' ? to + 1 : undefined
    return data.slice(from ?? 0, end)
  }

  _handleSelect() {
    const tableData = this._getTable()
    let result = this._applyFilters(tableData)
    const count = this._count ? result.length : undefined
    result = this._applyOrder(result)
    result = this._applyRange(result)

    if (this._single) {
      const item = result[0]
      if (!item) {
        return { data: null, error: new Error('Record not found') }
      }
      return { data: clone(item), error: null }
    }

    if (this._maybeSingle) {
      return { data: result[0] ? clone(result[0]) : null, error: null }
    }

    return { data: clone(result), error: null, count }
  }

  _handleInsert() {
    const tableData = this._getTable()
    const inserted = this._payload.map((record) => {
      const newRecord = {
        id: record.id ?? `${this.table}-${randomUUID()}`,
        created_at: record.created_at ?? new Date().toISOString(),
        updated_at: record.updated_at ?? new Date().toISOString(),
        ...record
      }
      tableData.push(newRecord)
      return clone(newRecord)
    })

    if (this._single || this._maybeSingle) {
      return { data: inserted[0] ?? null, error: null }
    }

    return { data: inserted, error: null }
  }

  _handleUpdate() {
    const tableData = this._getTable()
    const matches = this._applyFilters(tableData)
    const updated = []

    for (const record of matches) {
      Object.assign(record, this._payload, { updated_at: new Date().toISOString() })
      updated.push(clone(record))
    }

    if (this._single && !updated.length) {
      return { data: null, error: new Error('Record not found') }
    }

    if (this._maybeSingle) {
      return { data: updated[0] ?? null, error: null }
    }

    return { data: updated, error: null }
  }

  _handleUpsert() {
    const tableData = this._getTable()
    const payload = { ...this._payload }
    const conflictKey = this._upsertOptions?.onConflict

    let existingRecord = null
    if (conflictKey) {
      existingRecord = tableData.find((record) => record?.[conflictKey] === payload[conflictKey]) ?? null
    }

    if (existingRecord) {
      Object.assign(existingRecord, payload, { updated_at: new Date().toISOString() })
      return { data: clone(existingRecord), error: null }
    }

    const newRecord = {
      id: payload.id ?? `${this.table}-${randomUUID()}`,
      created_at: payload.created_at ?? new Date().toISOString(),
      updated_at: payload.updated_at ?? new Date().toISOString(),
      ...payload
    }
    tableData.push(newRecord)
    return { data: clone(newRecord), error: null }
  }

  execute() {
    switch (this._action) {
      case 'insert':
        return this._handleInsert()
      case 'update':
        return this._handleUpdate()
      case 'upsert':
        return this._handleUpsert()
      case 'select':
      default:
        return this._handleSelect()
    }
  }

  then(resolve, reject) {
    try {
      const result = this.execute()
      resolve(result)
    } catch (error) {
      reject(error)
    }
  }
}

class MockSupabaseClient {
  constructor() {
    this.auth = {
      getUser: async (token) => {
        if (!token) {
          return { data: null, error: new Error('No token provided') }
        }

        const session = MockSessionStore.getSession(token)
        if (!session) {
          return { data: null, error: new Error('Invalid or expired token') }
        }

        return { data: { user: clone(session.user) }, error: null }
      }
    }
  }

  from(table) {
    return new MockQueryBuilder(table)
  }
}

class MockSessionStore {
  static sessions = new Map()

  static createSession(user) {
    const payload = {
      id: user.id,
      email: user.email,
      roles: [...user.roles],
      exp: Date.now() + 60 * 60 * 1000,
      jti: randomUUID()
    }
    const tokenBody = Buffer.from(JSON.stringify(payload)).toString('base64')
    const token = `mihas.${tokenBody}`
    const session = {
      access_token: token,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: MockSessionStore._sanitizeUser(user)
    }
    MockSessionStore.sessions.set(token, session)
    return session
  }

  static getSession(token) {
    const existing = MockSessionStore.sessions.get(token)
    if (existing) {
      return existing
    }

    const decoded = MockSessionStore._decodeToken(token)
    if (!decoded) {
      return null
    }

    if (decoded.exp && decoded.exp < Date.now()) {
      return null
    }

    const user = mockUsers.find(candidate => candidate.id === decoded.id || candidate.email === decoded.email)
    if (!user) {
      return null
    }

    const session = {
      access_token: token,
      token_type: 'bearer',
      expires_in: Math.max(0, Math.floor(((decoded.exp ?? (Date.now() + 3600 * 1000)) - Date.now()) / 1000)),
      expires_at: Math.floor((decoded.exp ?? (Date.now() + 3600 * 1000)) / 1000),
      user: MockSessionStore._sanitizeUser(user)
    }

    MockSessionStore.sessions.set(token, session)
    return session
  }

  static authenticate(email, password) {
    const user = mockUsers.find((candidate) => candidate.email === email && candidate.password === password)
    if (!user) {
      return { error: new Error('Invalid email or password') }
    }

    const session = MockSessionStore.createSession(user)
    return { user: clone(session.user), session }
  }

  static _decodeToken(token) {
    if (typeof token !== 'string' || !token.startsWith('mihas.')) {
      return null
    }

    const body = token.slice(6)
    try {
      const decoded = JSON.parse(Buffer.from(body, 'base64').toString('utf8'))
      if (!decoded || typeof decoded !== 'object') {
        return null
      }
      return decoded
    } catch (error) {
      return null
    }
  }

  static _sanitizeUser(user) {
    return {
      id: user.id,
      email: user.email,
      user_metadata: {
        first_name: user.first_name,
        last_name: user.last_name,
        ...user.metadata
      },
      app_metadata: {
        roles: [...user.roles]
      }
    }
  }
}

const mockSupabaseAdminClient = new MockSupabaseClient()

const mockSupabaseAnonClient = {
  auth: {
    signInWithPassword: async ({ email, password }) => {
      const result = MockSessionStore.authenticate(email, password)
      if (result.error) {
        return { data: null, error: result.error }
      }
      return { data: { user: result.user, session: result.session }, error: null }
    }
  }
}

export {
  MockSessionStore,
  mockSupabaseAdminClient,
  mockSupabaseAnonClient
}
